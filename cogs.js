module.exports = {
  pipe: [
    {
      name: 'replace',
      only: '**/*.js',
      options: {
        flags: 'g',
        patterns: {'process.env.NODE_ENV': "'development'"}
      }
    },
    {
      name: 'babel',
      only: 'src/client/**/*.js',
      options: {presets: ['es2015', 'stage-0', 'react']}
    },
    {
      name: 'concat-commonjs',
      only: '**/*.+(js|json|vert|frag)',
      options: {entry: 'src/client/index.js'}
    }
  ],
  builds: {
    'src/client/index.js': 'public/index.js'
  }
};
