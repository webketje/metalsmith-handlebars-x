/* eslint-env node, mocha */
const { strictEqual, deepStrictEqual } = require('assert');
const metalsmith = require('metalsmith');
const plugin = require('../lib');
const helpers = require('../lib/helpers');
const hbs = require('handlebars');
const path = require('path');
const Metalsmith = require('metalsmith');

// make tests work on Windows (backslash -> slash, \r\n -> \n)
function normalizeFiles(files) {
  return Object.assign(
    files,
    Object.keys(files).reduce((result, p) => {
      const pNew = p.replace(/\\|\//g, path.sep);
      result[pNew] = Object.assign({}, files[p]);
      result[pNew].contents = Buffer.from(files[p].contents.toString().replace(/\r\n/g, '\n'));
      delete files[p];
      return result;
    }, {})
  );
}

function contentsOf(files, p) {
  return files[p.replace(/\\|\//g, path.sep)].contents.toString();
}

const testfiles = {
  'posts/simple.hbs': {
    contents: Buffer.from("{{> simple 'test:simple'}}")
  },
  'posts/relative-partials/index.hbs': {
    contents: Buffer.from('test:{{#> local }}partial{{/local}}')
  },
  'posts/nested-relative-partials/index.hbs': {
    contents: Buffer.from(
      'test:{{#> parent }}{{#> nested/child }}grandchild{{/ nested/child}}{{/parent}}'
    )
  },
  'posts/relative-partials2/inline-partials.hbs': {
    contents: Buffer.from(
      'test:{{#> layouts/default }}{{#*inline "dynamic" }}dynamic!{{/inline}}{{/layouts/default}}'
    )
  },
  'posts/valid-layout.hbs': {
    title: 'valid',
    layout: 'valid-layout',
    contents: Buffer.from('test:')
  },
  'posts/invalid-layout.hbs': {
    title: 'invalid',
    layout: 'invalid-layout',
    contents: Buffer.from('test:')
  },
  'posts/local-partial-override/index.hbs': {
    contents: Buffer.from("{{> simple 'test:local-override' }}")
  },
  'api-helpers.hbs': {
    contents: Buffer.from("{{ prefix 'local' 'test:' }} & {{ instancehelper }} helpers")
  },
  'api-data.hbs': {
    contents: Buffer.from('test:{{ extraProperty }}')
  }
};

const partials = {
  'partials/simple.hbs': {
    contents: Buffer.from('<h1>{{ this }}</h1>')
  },
  'partials/layouts/default.hbs': {
    contents: Buffer.from('{{@partial-block }}layout')
  },
  'partials/valid-layout.hbs': {
    contents: Buffer.from('{{{contents}}}{{ title }} layout')
  },
  'posts/relative-partials/partials/local.hbs': {
    contents: Buffer.from('local,{{ @partial-block }}')
  },
  'posts/nested-relative-partials/partials/parent.hbs': {
    contents: Buffer.from('parent,{{ @partial-block }}')
  },
  'posts/nested-relative-partials/partials/nested/child.hbs': {
    contents: Buffer.from('child,{{ @partial-block }}')
  },
  'posts/local-partial-override/partials/simple.hbs': {
    contents: Buffer.from('<p>{{ this }}</p>')
  }
};

function cleanup() {}

describe('renameExtension option', function () {
  let ms;

  beforeEach(function () {
    ms = metalsmith(__dirname)
      .source('.')
      .destination('./dist')
      .ignore('**')
      .env('DEBUG', process.env.DEBUG)
      .env('NODE_ENV', process.env.NODE_ENV)
      .use((files) => {
        files['posts/simple.hbs'] = { contents: testfiles['posts/simple.hbs'].contents };
        files['partials/simple.hbs'] = { contents: partials['partials/simple.hbs'].contents };
        files['posts/simple.hbs'] = { contents: testfiles['posts/simple.hbs'].contents };
      });
  });

  it('should not touch the extension when === null', function (done) {
    ms.use(
      plugin({
        instance: hbs,
        layout: true,
        renameExtension: null
      })
    ).process((err, fs) => {
      if (err) {
        done(err);
      } else {
        deepStrictEqual(Object.keys(fs), ['posts/simple.hbs']);
        done();
      }
    });
  });

  it('should trim the extension when === ""', function (done) {
    ms.use(
      plugin({
        instance: hbs,
        layout: true,
        renameExtension: ''
      })
    ).process((err, fs) => {
      if (err) {
        done(err);
      } else {
        deepStrictEqual(Object.keys(fs), ['posts/simple']);
        done();
      }
    });
  });

  it('should rename the extension when === ".<ext>"', function (done) {
    ms.use(
      plugin({
        instance: hbs,
        layout: true,
        renameExtension: '.html'
      })
    ).process((err, fs) => {
      if (err) {
        done(err);
      } else {
        deepStrictEqual(Object.keys(fs), ['posts/simple.html']);
        done();
      }
    });
  });
});

describe('Handlebars.partials & helpers support', function () {
  let files;

  before(function (done) {
    hbs.registerHelper('instancehelper', () => 'instance');

    metalsmith(__dirname)
      .source('.')
      .destination('./dist')
      .ignore('**')
      .env('DEBUG', process.env.DEBUG)
      .use((files, m, done) => {
        normalizeFiles(Object.assign(files, partials, testfiles));
        setImmediate(done);
      })
      .use(
        plugin({
          instance: hbs,
          layout: true,
          helpers: {
            prefix: (value, prefix) => {
              return prefix + value;
            }
          },
          context: (file, metadata) => {
            return Object.assign(
              {
                extraProperty: 'extra'
              },
              metadata,
              file
            );
          }
        })
      )
      .process((err, fs) => {
        if (err) {
          return done(err);
        }
        files = fs;
        done();
      });
  });

  // partials
  it('should support simple partial loading from root dir', () => {
    strictEqual(contentsOf(files, 'posts/simple.hbs'), '<h1>test:simple</h1>');
  });
  it('should support relative partial loading from subdir', () => {
    strictEqual(contentsOf(files, 'posts/relative-partials/index.hbs'), 'test:local,partial');
  });
  it('should support nested partial loading from root dir & inline partials', () => {
    strictEqual(contentsOf(files, 'posts/relative-partials2/inline-partials.hbs'), 'test:layout');
  });
  it('should support nested partial loading from subdir', () => {
    strictEqual(
      contentsOf(files, 'posts/nested-relative-partials/index.hbs'),
      'test:parent,child,grandchild'
    );
  });
  it('should overwrite global with local partials', () => {
    strictEqual(
      contentsOf(files, 'posts/local-partial-override/index.hbs'),
      '<p>test:local-override</p>'
    );
  });

  // API: layout
  it('should render with layout when layout:true and layout is found', () => {
    strictEqual(contentsOf(files, 'posts/valid-layout.hbs'), 'test:valid layout');
  });
  it('should render without layout when layout:true and layout is not found', () => {
    strictEqual(contentsOf(files, 'posts/invalid-layout.hbs'), 'test:');
  });

  // API:
  it('should provide functional helpers', () => {
    strictEqual(
      helpers.call((...args) => args.join(), 1, 2, true, null),
      '1,2,true'
    );

    const context = { data: { root: {} } };
    helpers.set('x', false, context);
    strictEqual(context.data.root.x, false);
  });

  it("should register default 'call' & 'set' helpers", () => {
    strictEqual(
      Object.keys(hbs.helpers).filter((h) => Object.keys(helpers).includes(h)).length,
      Object.keys(helpers).length
    );
  });
  it('should render helpers when provided through options or as part of instance', () => {
    strictEqual(contentsOf(files, 'api-helpers.hbs'), 'test:local & instance helpers');
  });

  // API: context
  it('should allow template context to be modified with a context function', () => {
    strictEqual(contentsOf(files, 'api-data.hbs'), 'test:extra');
  });

  after(cleanup);
});

describe('Error handling', function () {
  it('should throw when a Handlebars compile error occurs', (done) => {
    Metalsmith(__dirname)
      .source('.')
      .ignore('**')
      .env('DEBUG', process.env.DEBUG)
      .use((files) => {
        files[path.join('posts', 'error.hbs')] = {
          contents: Buffer.from('{{#if }}')
        };
      })
      .use(plugin())
      .process((err) => {
        strictEqual(err instanceof Error, true);
        strictEqual(err.message.slice(0, 21), 'Parse error on line 1');
        done();
      });
  });
});

describe('Metalsmith plugins interop', function () {
  let instance;

  beforeEach(() => {
    instance = metalsmith(path.join(__dirname, 'mocks'))
      .source('.')
      .destination('./dist')
      .use(plugin({ layout: false, instance: hbs, pattern: ['**/*.hbs'] }));
  });

  it('should work well with @metalsmith/layouts when layouts:false', (done) => {
    require('jstransformer-handlebars');

    const layouts = require('@metalsmith/layouts')({
      directory: './partials',
      pattern: '**/test.hbs',
      suppressNoFilesError: true
    });

    const discoverPartials = require('metalsmith-discover-partials')({
      directory: './mocks/partials'
    });

    instance
      .use(discoverPartials)
      .use(layouts)
      .ignore('**/handlebars-layouts*')
      .process((err, result) => {
        if (err) {
          return done(err);
        }

        result = normalizeFiles(result);

        strictEqual(contentsOf(result, 'test.hbs'), 'test:layout included');
        strictEqual(contentsOf(result, 'posts/test.hbs'), 'test:layout included');

        done();
      });
  });

  it('should work well with handlebars-layouts', (done) => {
    hbs.registerHelper(require('handlebars-layouts')(hbs));

    instance
      .use(plugin({ instance: hbs, helpers: false }))
      .ignore('**/test.hbs')
      .process((err, result) => {
        if (err) {
          return done(err);
        }

        result = normalizeFiles(result); // windows compat

        const expected =
          [
            '<h1>Goodnight Moon</h1>',
            '<p>Lorem ipsum.</p>',
            '<p>Dolor sit amet.</p>',
            '<p>MIT License</p>',
            '<p>&copy; 1999</p>'
          ].join('\n') + '\n';

        strictEqual(contentsOf(result, 'posts/handlebars-layouts-post.hbs'), expected);

        done();
      });
  });

  after(cleanup);
});
