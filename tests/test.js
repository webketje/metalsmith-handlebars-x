const test = require('ospec');
const metalsmith = require('metalsmith');
const plugin = require('../lib');
const helpers = require('../lib/helpers');
const hbs = require('handlebars');
const path = require('path');

// make tests work on Windows (backslash -> slash, \r\n -> \n)
function normalizeFiles(files) {
  return Object.assign(
    files,
    Object.keys(files).reduce((result, p) => {
      const pNew = p.replace(/\\|\//g, path.sep);
      result[pNew] = files[p];
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
  'posts/error.hbs': {
    contents: Buffer.from('{{#if }}')
  },
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

test.spec('Handlebars.partials support', function () {
  let files;

  test.before(function (done) {
    hbs.registerHelper('instancehelper', () => 'instance');

    metalsmith(__dirname)
      .source('.')
      .destination('./dist')
      .ignore('**')
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
        if (err) return done(err);
        files = fs;
        done();
      });
  });

  // partials
  test('should support simple partial loading from root dir', () => {
    test(contentsOf(files, 'posts/simple.hbs')).equals('<h1>test:simple</h1>');
  });
  test('should support relative partial loading from subdir', () => {
    test(contentsOf(files, 'posts/relative-partials/index.hbs')).equals('test:local,partial');
  });
  test('should support nested partial loading from root dir & inline partials', () => {
    test(contentsOf(files, 'posts/relative-partials2/inline-partials.hbs')).equals('test:layout');
  });
  test('should support nested partial loading from subdir', () => {
    test(contentsOf(files, 'posts/nested-relative-partials/index.hbs')).equals(
      'test:parent,child,grandchild'
    );
  });
  test('should overwrite global with local partials', () => {
    test(contentsOf(files, 'posts/local-partial-override/index.hbs')).equals(
      '<p>test:local-override</p>'
    );
  });
  test('should log a debug message when a Handlebars compile error occurs', () => {
    test(contentsOf(files, 'posts/error.hbs')).equals('{{#if }}');
  });

  // API: layout
  test('should render with layout when layout:true and layout is found', () => {
    test(contentsOf(files, 'posts/valid-layout.hbs')).equals('test:valid layout');
  });
  test('should render without layout when layout:true and layout is not found', () => {
    test(contentsOf(files, 'posts/invalid-layout.hbs')).equals('test:');
  });

  // API:
  test('should provide functional helpers', () => {
    test(helpers.call((...args) => args.join(), 1, 2, true, null)).equals('1,2,true');

    const context = { data: { root: {} } };
    helpers.set('x', false, context);
    test(context.data.root.x).equals(false);
  });

  test("should register default 'call' & 'set' helpers", () => {
    test(Object.keys(hbs.helpers).filter((h) => Object.keys(helpers).includes(h)).length).equals(
      Object.keys(helpers).length
    );
  });
  test('should render helpers when provided through options or as part of instance', () => {
    test(contentsOf(files, 'api-helpers.hbs')).equals('test:local & instance helpers');
  });

  // API: context
  test('should allow template context to be modified with a context function', () => {
    test(contentsOf(files, 'api-data.hbs')).equals('test:extra');
  });

  test.after(cleanup);
});

test.spec('Metalsmith plugins interop', function () {
  let instance;

  test.beforeEach(() => {
    instance = metalsmith(path.join(__dirname, 'mocks'))
      .source('.')
      .destination('./dist')
      .use(plugin({ layout: false, instance: hbs, pattern: ['**/*.hbs'] }));
  });

  test('should work well with metalsmith-layouts when layouts:false', (done) => {
    require('jstransformer-handlebars');

    const layouts = require('metalsmith-layouts')({
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
        if (err) return done(err);

        result = normalizeFiles(result);

        test(contentsOf(result, 'test.hbs')).equals('test:layout included');
        test(contentsOf(result, 'posts/test.hbs')).equals('test:layout included');

        done();
      });
  });

  test('should work well with handlebars-layouts', (done) => {
    hbs.registerHelper(require('handlebars-layouts')(hbs));

    instance
      .use(plugin({ instance: hbs, helpers: false }))
      .ignore('**/test.hbs')
      .process((err, result) => {
        if (err) return done(err);

        result = normalizeFiles(result); // windows compat

        const expected =
          [
            '<h1>Goodnight Moon</h1>',
            '<p>Lorem ipsum.</p>',
            '<p>Dolor sit amet.</p>',
            '<p>MIT License</p>',
            '<p>&copy; 1999</p>'
          ].join('\n') + '\n';

        test(contentsOf(result, 'posts/handlebars-layouts-post.hbs')).equals(expected);

        done();
      });
  });

  test.after(cleanup);
});
