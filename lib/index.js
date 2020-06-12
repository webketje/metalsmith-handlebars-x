var path = require('path');
var multimatch = require('multimatch');
var helpers = require('./helpers');

/** @typedef Handlebars
 * @type Object
 */
var Handlebars = require('handlebars');

var debug = require('debug')('metalsmith-handlebars');

var defaults = {
  helpers: {},
  pattern: '**/*.{hbs,handlebars}',
  partials: 'partials',
  instance: Handlebars,
  layout: false,
  data(data, metadata) {
    return Object.assign({}, metadata, data);
  }
};

/**
 * Convert a path to use forward slashes
 * @param {string} p
 */
function normalizedPath(p) {
  return p.replace(/\\+/g, '/');
}

/**
 * Retrieve string contents of a metalsmith file
 * @param {Object} file
 */
function contents(file) {
  return file && file.contents && file.contents.toString();
}

/**
 * Normalize fileObject.layout property
 * @param {*} file
 */
function getLayout(file) {
  return file && file.layout && file.layout.replace(/\.hbs|handlebars$/, '');
}

/**
 * Convert a partial path to a partial name
 * @param {string} partialsPath
 * @param {string} p
 */
function partialName(partialsPath, p) {
  const normalized = normalizedPath(partialsPath);
  return normalizedPath(p.slice(normalized.length + 1, p.lastIndexOf('.')));
}

/**
 * Integrates Handlebars in your metalsmith workflow
 * @param {Object} options
 * @param {string|string[]} [options.pattern] Glob or array of glob patterns matching files to process. Default is '\*\*\/*.{hbs,handlebars}'
 * @param {Object} [options.helpers] An object in which each key value pair is a helper name, and function. Default is {}
 * @param {string} [options.partials='partials'] Directory where to find global/local partials. Default is 'partials'
 * @param {Handlebars} [options.instance=Handlebars] A custom Handlebars instance
 * @param {boolean} [options.layout=false] Whether layout should be processed by this plugin
 */
module.exports = function metalsmithHandlebarsIntegrated(options) {
  const config = Object.assign({}, defaults, options);

  return function metalsmithHandlebars(fileList, metalsmith, next) {
    setImmediate(next);

    const fileNames = Object.keys(fileList);
    const metaData = metalsmith.metadata();

    var allPartials = multimatch(
      fileNames,
      `**/${config.partials}/**/*.{hbs,handlebars}`
    );
    var globalPartials = multimatch(
      allPartials,
      `${config.partials}/**/*.{hbs,handlebars}`
    );

    // register global partials
    globalPartials.forEach((p) => {
      config.instance.registerPartial(
        partialName(config.partials, p),
        contents(fileList[p])
      );
      delete fileList[p];
    });

    // register global helpers
    config.instance.registerHelper(helpers);
    if (config.helpers && Object.keys(config.helpers).length) {
      config.instance.registerHelper(config.helpers);
    }
    if (!Array.isArray(config.pattern)) config.pattern = [config.pattern];

    config.pattern.push(`!**/${config.partials}/**/*.{hbs,handlebars}`);
    var matches = multimatch(fileNames, config.pattern);

    // first group files by directory, so local partials should only be registered once
    var templateDirs = matches.reduce((result, current) => {
      var key = path.dirname(current);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(current);
      return result;
    }, {});

    Object.keys(templateDirs).forEach(function (basedir) {
      const partialDir = path.join(basedir, config.partials);
      const localPartials = allPartials.filter((partial) =>
        partial.startsWith(partialDir)
      );

      // create a new Handlebars instance for local partials but include global partials first
      // TODO check if unregistering or renaming them isn't cheaper
      var HbsInstance = config.instance;
      HbsInstance.registerPartial(config.instance.partials);

      localPartials.forEach((p) => {
        if (globalPartials.indexOf(p) === -1) {
          HbsInstance.registerPartial(
            partialName(partialDir, p),
            contents(fileList[p])
          );
        }
      });
      templateDirs[basedir].forEach(function (filePath) {
        const fileObject = fileList[filePath];
        const template = HbsInstance.compile(contents(fileObject));
        const localData = config.data(fileObject, metaData);

        fileObject.contents = Buffer.from(template(localData));

        if (fileObject.layout && config.layout) {
          if (!config.instance.partials[fileObject.layout]) {
            debug(
              "Handlebars layout '%s' specified in '%s' not found",
              fileObject.layout,
              filePath
            );
          } else {
            const outerTemplate = config.instance.compile(
              '{{>' + getLayout(fileObject) + '}}'
            );
            fileObject.contents = Buffer.from(
              outerTemplate(config.data(fileObject, metaData))
            );
          }
        }
      });
      localPartials.forEach((p) => {
        if (!globalPartials.includes(p)) {
          delete fileList[p];
          HbsInstance.unregisterPartial(p);
        }
      });
    });
    if (!config.layout) globalPartials.forEach((p) => delete fileList[p]);
  };
};
module.exports.VERSION = require('../package.json').version;
