var test = require('ospec');
var metalsmith = require('metalsmith');
var plugin = require('../lib');
var helpers = require('../lib/helpers');
var hbs = require('handlebars');

var testfiles = {
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
  'api-helpers.hbs': {
    contents: Buffer.from(
      "{{ prefix 'local' 'test:' }} & {{ instancehelper }} helpers"
    )
  },
  'api-data.hbs': {
    contents: Buffer.from('test:{{ extraProperty }}')
  }
};

var partials = {
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
  }
};

function cleanup() { }

test.spec('Handlebars.partials support', function () {
  var files;

  test.before(function (done) {
    hbs.registerHelper('instancehelper', () => 'instance');

    metalsmith(__dirname)
      .source('.')
      .destination('./dist')
      .ignore('**')
      .use((files, m, done) => {
        Object.assign(files, partials, testfiles);
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
            return Object.assign({
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
          done(err);
          console.log(err);
          return;
        }
        files = fs;
        done();
      });
  });

  // partials
  test('should support simple partial loading from root dir', () => {
    test(files['posts/simple.hbs'].contents.toString()).equals(
      '<h1>test:simple</h1>'
    );
  });
  test('should support relative partial loading from subdir', () => {
    test(files['posts/relative-partials/index.hbs'].contents.toString()).equals(
      'test:local,partial'
    );
  });
  test('should support nested partial loading from root dir & inline partials', () => {
    test(
      files['posts/relative-partials2/inline-partials.hbs'].contents.toString()
    ).equals('test:layout');
  });
  test('should support nested partial loading from subdir', () => {
    test(
      files['posts/nested-relative-partials/index.hbs'].contents.toString()
    ).equals('test:parent,child,grandchild');
  });

  // API: layout
  test('should render with layout when layout:true and layout is found', () => {
    test(files['posts/valid-layout.hbs'].contents.toString()).equals(
      'test:valid layout'
    );
  });
  test('should render without layout when layout:true and layout is not found', () => {
    test(files['posts/invalid-layout.hbs'].contents.toString()).equals('test:');
  });

  // API: helpers
  test("should register default 'call' & 'set' helpers", () => {
    test(
      Object.keys(hbs.helpers).filter((h) => Object.keys(helpers).includes(h))
        .length
    ).equals(Object.keys(helpers).length);
  });
  test('should render helpers when provided through options or as part of instance', () => {
    test(files['api-helpers.hbs'].contents.toString()).equals(
      'test:local & instance helpers'
    );
  });

  // API: data
  test('should allow template context to be modified with a data function', () => {
    test(files['api-data.hbs'].contents.toString()).equals('test:extra');
  });

  test.after(cleanup);
});

test.spec('Metalsmith plugins interop', function () {
  var instance;

  test.beforeEach(() => {
    instance = metalsmith(require('path').join(__dirname, 'mocks'))
      .source('.')
      .destination('./dist')
      .use(plugin({ layout: false, instance: hbs }));
  });

  test('should work well with metalsmith-layouts when layouts:false', (done) => {
    require('jstransformer-handlebars');

    var layouts = require('metalsmith-layouts')({
      directory: './partials',
      pattern: '**/test.hbs',
      suppressNoFilesError: true
    });

    var discoverPartials = require('metalsmith-discover-partials')({
      directory: './mocks/partials'
    });

    instance
      .use(discoverPartials)
      .use(layouts)
      .ignore('**/handlebars-layouts*')
      .process((err, result) => {
        if (err) return done(err);

        test(result['test.hbs'].contents.toString()).equals(
          'test:layout included'
        );
        test(result['posts/test.hbs'].contents.toString()).equals(
          'test:layout included'
        );

        done();
      });
  });

  test('should work well with handlebars-layouts', (done) => {
    hbs.registerHelper(require('handlebars-layouts')(hbs));

    instance.use(plugin({ instance: hbs })).process((err, files) => {
      var expected =
        [
          '<h1>Goodnight Moon</h1>',
          '<p>Lorem ipsum.</p>',
          '<p>Dolor sit amet.</p>',
          '<p>MIT License</p>',
          '<p>&copy; 1999</p>'
        ].join('\n') + '\n';

      test(
        files['posts/handlebars-layouts-post.hbs'].contents.toString()
      ).equals(expected);

      done(err);
    });
  });

  test.after(cleanup);
});
