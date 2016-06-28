import gulp from 'gulp'
import babel from 'gulp-babel'
import browserify from 'browserify'
import source from 'vinyl-source-stream'

const bundleName = 'polymer-redux'
const paths = {
    src: './src',
    lib: './lib',
    dist: './dist'
}

gulp.task('babel', () => {
    return gulp.src([
        `${paths.src}/**/*.js`
    ])
    .pipe(babel())
    .pipe(gulp.dest(paths.lib))
})

gulp.task('build', ['babel'], () => {
    return browserify({
        entries: [`${paths.lib}/index.js`]
    })
    .transform({ global: true }, 'uglifyify')
    .bundle()
    .pipe(source(`${bundleName}.js`))
    .pipe(gulp.dest(paths.dist))
})