# Metalsmith+handlebars

The best plugin for metalsmith + Handlebars. Global/local partials, in-place & layout compilation, and maximum customizability. Combines all of [metalsmith-handlebars], [metalsmith-handlebars-contents], [metalsmith-handlebars-layouts], [metalsmith-discover-helpers], [metalsmith-discover-partials], [@goodthnx/metalsmith-handlebars], [metalsmith-nested], [metalsmith-register-helpers], [metalsmith-register-partials] and adds more. Written out of frustration with incomplete and/or complex existing options.

[![metalsmith: plugin][metalsmith-badge]][metalsmith-url]
[![npm: version][npm-badge]][npm-url]
[![travis: build][ci-badge]][ci-url]
[![license: LGPL-3.0][license-badge]][license-url]

```js
const handlebars = require('metalsmith-handlebars-x')({
  pattern: '**/*.{hbs,handlebars}',
  layout: true,
  instance: null,
  partials: 'partials',
  metadata: function (page, global) {
    return Object.assign({}, global, page);
  },
  helpers: {}
});

metalsmith.use(handlebars);
```

## Install

NPM:

```bash
npm i -D metalsmith-handlebars-x
```

Yarn:

```bash
yarn add metalsmith-handlebars-x
```

## Quickstart

```js
var handlebars = require('metalsmith-handlebars-x');

metalsmith.use(handlebars());
```

## Debug

Set env var `DEBUG` to `metalsmith-handlebars-x`.

Linux / OSX

```bash
DEBUG=metalsmith-handlebars-x
```

Windows

```batch
set DEBUG=metalsmith-handlebars-x
```

## Usage

### Global partials

Global partials (available to all templates) can be registered either by specifying a directory in the `Metalsmith.source` directory:

```js
metalsmith.use(handlebars({ partials: 'partials' }));
```

and by passing the Handlebars instance to the plugin:

```js
var Handlebars = require('handlebars');
Handlebars.registerPartial(
  'blockquote',
  '<blockquote cite="{{url}}">{{ quote }}</blockquote>'
);

metalsmith.use(handlebars({ instance: Handlebars }));
```

Both can be used together!

### Local partials

Local partials will be available to all templates that reside in the same directory.  
In the directory structure below both `.md` files have access to partial `layout/default`.

```txt
├── partials
|    └── layout
|         └── default.hbs
└── posts
    ├── partials
    |    └── local.hbs
    ├── subfolder
    |    └── post-without-local-partials.md
    └── post-with-local-partials.md
```

### Helpers

metalsmith-handlebars-x provides 2 useful helpers by default:

- `call` : `{{ call func arg1 arg2 arg3 }}` allows calling functions available in template context
- `set`: `{{ set varname value }}` allows storing temporary variables for re-use in the template

Register extra helpers through the `helpers` option as `{[helperName]: helperFunc}`, or similar to global partials,
register them directly on a Handlebars instance passed to the `instance` option.

### Metadata mapping

Specify a custom `metadata` option to map file & global metadata in your templates, e.g:

```js
metadata: function(filemeta, globalmeta) {
  return {
    page: filemeta,
    site: globalmeta
  };
}
```

In your templates:

```html
{{ site.sitename }} {{ page.stats.birthTime }}
```

### With metalsmith-layouts & metalsmith-discover-partials (discouraged)

## License

[LGPL v0.3](./LICENSE)

[npm-badge]: https://img.shields.io/npm/v/metalsmith-handlebars-x
[npm-url]: https://www.npmjs.com/package/metalsmith-handlebars-x
[ci-badge]: https://img.shields.io/travis/webketje/metalsmith-handlebars-x
[ci-url]: https://travis-ci.org/webketje/metalsmith-handlebars-x
[license-badge]: https://img.shields.io/github/license/webketje/metalsmith-handlebars-x
[license-url]: https://choosealicense.com/licenses/lgpl-3.0/
[metalsmith-badge]: https://img.shields.io/badge/metalsmith-plugin-green.svg?longCache=true
[metalsmith-url]: https://metalsmith.io/
[metalsmith-handlebars]: https://www.npmjs.com/package/metalsmith-handlebars
[metalsmith-handlebars-contents]: https://www.npmjs.com/package/metalsmith-handlebars-contents
[metalsmith-handlebars-layouts]: https://www.npmjs.com/package/metalsmith-handlebars-layouts
[metalsmith-discover-helpers]: https://www.npmjs.com/package/metalsmith-discover-helpers
[metalsmith-discover-partials]: https://www.npmjs.com/package/metalsmith-discover-partials
[@goodthnx/metalsmith-handlebars]: https://www.npmjs.com/package/@goodthnx/metalsmith-handlebars
[metalsmith-nested]: https://www.npmjs.com/package/metalsmith-nested
[metalsmith-register-helpers]: https://www.npmjs.com/package/metalsmith-register-helpers
[metalsmith-register-partials]: https://www.npmjs.com/package/metalsmith-register-partials