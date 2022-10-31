'use strict';

const path = require('path');
const helpers = require('./helpers');

/** @type {import('handlebars')} */
const Handlebars = require('handlebars');

const defaults = {
  helpers: {},
  pattern: '**/*.{hbs,handlebars}',
  partials: 'partials',
  instance: Handlebars,
  layout: true,
  context: (data, metadata) => Object.assign({}, metadata, data),
  renameExtension: null
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
 * @callback ContextCallback
 * @param {{[key:string]:any}} fileMetadata
 * @param {Object} globalMetadata
 * @returns {*}
 */

/**
 * Integrates Handlebars in your metalsmith workflow
 * @param {Object} options
 * @param {string|string[]} [options.pattern] Glob or array of glob patterns matching files to process. Default is '\*\*\/*.{hbs,handlebars}'
 * @param {Object} [options.helpers] An object in which each key value pair is a helper name, and function. Default is {}
 * @param {string} [options.partials='partials'] Directory where to find global/local partials. Default is 'partials'
 * @param {Handlebars} [options.instance=Handlebars] A custom Handlebars instance
 * @param {boolean} [options.layout=false] Whether layout should be processed by this plugin
 * @param {ContextCallback} [options.context] Pass a callback which returns a template context object. Receives filemetadata, globalmetadata as arguments
 * @param {string} [options.renameExtension] Pass the extension to rename a processed file to. `null` (default) to keep the extension, `""` (empty string) to remove it, `.other.ext` to rename it.
 * @return {import('metalsmith').Plugin}
 */
module.exports = function initHandlebarsX(options) {
  /** @type {typeof options} */
  const config = Object.assign({}, defaults, options);
  const hbs = config.instance;

  return function handlebarsX(fileList, metalsmith, next) {
    const debug = metalsmith.debug('metalsmith-handlebars-x');
    const fileNames = Object.keys(fileList);
    const metaData = metalsmith.metadata();

    const allPartials = metalsmith.match(`**/${config.partials}/**/*.{hbs,handlebars}`, fileNames);
    const globalPartials = metalsmith.match(
      `${config.partials}/**/*.{hbs,handlebars}`,
      allPartials
    );

    // register global partials
    debug.info('Registering global partials: %o', globalPartials);
    globalPartials.forEach((p) => {
      hbs.registerPartial(partialName(config.partials, p), contents(fileList[p]));
      delete fileList[p];
    });

    // register included helpers
    hbs.registerHelper(helpers);

    // register parameter helpers if any
    if (config.helpers) {
      hbs.registerHelper(config.helpers);
    }

    if (!Array.isArray(config.pattern)) {
      config.pattern = [config.pattern];
    }

    // exclude partials from being included as templates
    config.pattern.push(`!**/${config.partials}/**/*.{hbs,handlebars}`);

    // first group files by directory, so local partials should only be registered once
    const matches = metalsmith.match(config.pattern, fileNames);
    const templateDirs = matches.reduce((result, current) => {
      const key = path.dirname(current);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(current);
      return result;
    }, {});

    Object.keys(templateDirs).forEach(function (basedir) {
      const partialDir = path.join(basedir, config.partials);
      const localPartials = allPartials.filter((partial) => partial.startsWith(partialDir));

      localPartials.forEach((p) => {
        // BREAKING CHANGE TO BE ADDED HERE: invert logic: local partials get precedence
        if (!globalPartials.includes(p)) {
          hbs.registerPartial(partialName(partialDir, p), contents(fileList[p]));
        }
      });

      templateDirs[basedir].forEach(function (filePath) {
        debug.info('Compiling "%s"', filePath);
        const fileObject = fileList[filePath];
        const localData = config.context(fileObject, metaData);

        try {
          const template = hbs.compile(contents(fileObject));
          fileObject.contents = Buffer.from(template(localData));
        } catch (err) {
          debug.error("Handlebars contents compile - %s for '%s'", err.message, filePath);
          next(err);
        }

        // only compile layout if config.layout is explicitly true or omitted
        if (fileObject.layout && config.layout !== false) {
          if (!hbs.partials[fileObject.layout]) {
            debug.warn(
              "Handlebars layout '%s' specified in '%s' not found",
              fileObject.layout,
              filePath
            );
          } else {
            try {
              const outerTemplate = hbs.compile('{{>' + getLayout(fileObject) + '}}');
              fileObject.contents = Buffer.from(
                outerTemplate(config.context(fileObject, metaData))
              );
            } catch (err) {
              debug.error("Handlebars layout compile - %s for '%s'", err.message, filePath);
              next(err);
            }
          }
        }

        // handle extension renaming
        const rename = config.renameExtension;
        if (typeof rename === 'string' && (rename === '' || rename.startsWith('.'))) {
          let newFPath = filePath.slice(0, -path.extname(filePath).length);
          if (rename !== '') {
            newFPath = newFPath + rename;
          }
          debug.info('Renaming "%s" to "%s".', filePath, newFPath);
          fileList[newFPath] = fileList[filePath];
          delete fileList[filePath];
        }
      });

      localPartials.forEach((p) => {
        if (!globalPartials.includes(p)) {
          delete fileList[p];
          hbs.unregisterPartial(p);
        }
      });
    });

    // only remove partials if config.layout is explicitly false
    if (config.layout !== false) {
      allPartials.forEach((p) => delete fileList[p]);
    }

    next();
  };
};
