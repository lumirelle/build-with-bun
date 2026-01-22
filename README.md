# @lumirelle/build-with-bun

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![Codecov][codecov-src]][codecov-href]
[![License][license-src]][license-href]

A utils for building JS/TS projects with bun.

## Todos

- [x] Support resolving path alias in `tsconfig.json`.
- [x] Correctly handle dts content generation for entrypoints.
- [x] Use `obug` to provide debugging info.
- [ ] Avoid missing rebuild if file changes happens during ongoing rebuild.
- [ ] Safely close watchers on exit.
- [ ] Prompt user to enable `isolateModules` if not enabled.
- [ ] ...

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/lumirelle/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/lumirelle/static/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE.md) License © [Lumirelle](https://github.com/Lumirelle)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@lumirelle/build-with-bun?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/@lumirelle/build-with-bun
[npm-downloads-src]: https://img.shields.io/npm/dm/@lumirelle/build-with-bun?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/@lumirelle/build-with-bun
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@lumirelle/build-with-bun?style=flat&colorA=18181B&colorB=F0DB4F&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=@lumirelle/build-with-bun
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=18181B&colorB=F0DB4F
[jsdocs-href]: https://www.jsdocs.io/package/@lumirelle/build-with-bun
[codecov-src]: https://img.shields.io/codecov/c/gh/lumirelle/build-with-bun/main?style=flat&colorA=18181B&colorB=F0DB4F
[codecov-href]: https://codecov.io/gh/lumirelle/build-with-bun
[license-src]: https://img.shields.io/github/license/lumirelle/build-with-bun.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/lumirelle/build-with-bun/blob/main/LICENSE.md
