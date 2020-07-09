var path = require('path');
var multimatch = require('multimatch');
var helpers = require('./helpers');
var debug = require('debug')('metalsmith-handlebars-x');
/** @typedef Handlebars
 * @type Object
 */
var Handlebars = require('handlebars');

var defaults = {
  helpers: {},
  pattern: '**/*.{hbs,handlebars}',
  partials: 'partials',
  instance: Handlebars,
  layout: true,
  context: (data, metadata) => {
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
 * Normalize fileObject.layout property (for migrating from metalsmith-layouts)
 * @param {Object} file
 */
function getLayout(file) {
  return file && file.layout && file.layout.replace(/\.hbs|handlebars$/, '');
}

/**
 * Convert a partial path to a partial name
 * @param {string} partialsDir
 * @param {string} partialPath
 */
function partialName(partialsDir, partialPath) {
  const normalized = normalizedPath(partialsDir);
  return normalizedPath(partialPath.slice(normalized.length + 1, partialPath.lastIndexOf('.')));
}

/**
 * Integrates Handlebars in your metalsmith workflow
 * @param {Object} options
 * @param {string|string[]} [options.pattern] Glob or array of glob patterns matching files to process. Default is '\*\*\/*.{hbs,handlebars}'
 * @param {Object} [options.helpers] An object in which each key value pair is a helper name, and function. Default is {}
 * @param {string} [options.partials='partials'] Directory where to find global/local partials. Default is 'partials'
 * @param {Handlebars} [options.instance=Handlebars] A custom Handlebars instance
 * @param {boolean} [options.layout=false] Whether layout should be processed by this plugin
 * @param {Function} [options.context] Pass a callback which returns a template context object. Receives filemetadata, globalmetadata as arguments
 * @//param {string} [options.ext='rename'] 'replace','keep', or 'remove' the `.hbs/handlebars` extension
 * @return {import('metalsmith').Plugin}
 */
module.exports = function (options) {
  const config = Object.assign({}, defaults, options);

  return function handlebarsX(fileList, metalsmith) {
    const fileNames = Object.keys(fileList);
    const metaData = metalsmith.metadata();

    const allPartials = multimatch(fileNames, `**/${config.partials}/**/*.{hbs,handlebars}`);
    const globalPartials = multimatch(allPartials, `${config.partials}/**/*.{hbs,handlebars}`);

    // register global partials
    globalPartials.forEach((p) => {
      config.instance.registerPartial(partialName(config.partials, p), contents(fileList[p]));
      delete fileList[p];
    });

    // register included helpers
    config.instance.registerHelper(helpers);

    // register parameter helpers if any
    if (config.helpers) {
      config.instance.registerHelper(config.helpers);
    }

    if (!Array.isArray(config.pattern)) config.pattern = [config.pattern];

    // exclude partials from being included as templates
    config.pattern.push(`!**/${config.partials}/**/*.{hbs,handlebars}`);

    // first group files by directory, so local partials should only be registered once
    const matches = multimatch(fileNames, config.pattern);
    const templateDirs = matches.reduce((result, current) => {
      const key = path.dirname(current);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(current);
      return result;
    }, {});

    Object.keys(templateDirs).forEach(function (basedir, i) {
      const partialDir = path.join(basedir, config.partials);
      const localPartials = allPartials.filter((partial) => partial.startsWith(partialDir));

      localPartials.forEach((p) => {
        if (globalPartials.indexOf(p) === -1) {
          config.instance.registerPartial(partialName(partialDir, p), contents(fileList[p]));
        }
      });

      templateDirs[basedir].forEach(function (filePath) {
        const fileObject = fileList[filePath];
        const template = config.instance.compile(contents(fileObject));
        const localData = config.context(fileObject, metaData);

        try {
          fileObject.contents = Buffer.from(template(localData));
        } catch (err) {
          debug("Error: Handlebars compile - %s for '%s'", err.message, filePath);
        }

        // only compile layout if config.layout is explicitly true or omitted
        if (fileObject.layout && config.layout !== false) {
          if (!config.instance.partials[fileObject.layout]) {
            debug(
              "Handlebars layout '%s' specified in '%s' not found",
              fileObject.layout,
              filePath
            );
          } else {
            const outerTemplate = config.instance.compile('{{>' + getLayout(fileObject) + '}}');
            fileObject.contents = Buffer.from(outerTemplate(config.context(fileObject, metaData)));
          }
        }
      });
      localPartials.forEach((p) => {
        if (!globalPartials.includes(p)) {
          delete fileList[p];
          config.instance.unregisterPartial(p);
        }
      });
    });

    // only remove partials if config.layout is explicitly false
    if (config.layout !== false) {
      allPartials.forEach((p) => delete fileList[p]);
    }
  };
};
module.exports.VERSION = require('../package.json').version;
