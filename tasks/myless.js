/*
 * grunt-myless
 * http://gruntjs.com/
 *
 * Copyright (c) 2012 Tyler Kellen, contributors
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

    var fs = require('fs');
    var path = require('path');
    var less = Object.create(require('less'));
    var tree = Object.create(less.tree);
    var func = Object.create(tree.functions);    
    var lessOptions = {
        parse: ['paths', 'optimization', 'filename', 'strictImports', 'dumpLineNumbers'],
        render: ['compress', 'yuicompress']
    };
    
    // overwrite less.tree.data-uri
    less.tree = tree;
    tree.functions = func;
    func['data-uri'] = function(mimetypeNode, filePathNode) {        
        if (typeof window !== 'undefined') {
            return new tree.URL(filePathNode || mimetypeNode, this.currentFileInfo).eval(this.env);
        }

        var mimetype = mimetypeNode.value;
        var fileInfo = this.currentFileInfo;
        var filePath = (filePathNode && filePathNode.value);
        
        var fs = require('fs'),
            path = require('path'),
            useBase64 = false;

        if (arguments.length < 2) {
            filePath = mimetype;
        }

        if (this.env.isPathRelative(filePath)) {
            filePath = path.join(fileInfo.currentDirectory, filePath);
        }

        // detect the mimetype if not given
        if (arguments.length < 2) {
            var mime;
            try {
                mime = require('mime');
            } catch (ex) {
                mime = tree._mime;
            }

            mimetype = mime.lookup(filePath);

            // use base 64 unless it's an ASCII or UTF-8 format
            var charset = mime.charsets.lookup(mimetype);
            useBase64 = ['US-ASCII', 'UTF-8'].indexOf(charset) < 0;
            if (useBase64) { mimetype += ';base64'; }
        }
        else {
            useBase64 = /;base64$/.test(mimetype);
        }

        var buf = fs.readFileSync(filePath);

        // IE8 cannot handle a data-uri larger than 32KB. If this is exceeded
        // and the --ieCompat flag is enabled, return a normal url() instead.
        var DATA_URI_MAX_KB = 32,
        fileSizeInKB = parseInt((buf.length / 1024), 10);
        if (fileSizeInKB >= DATA_URI_MAX_KB) {

            if (this.env.ieCompat !== false) {
                if (!this.env.silent) {
                    console.warn("Skipped data-uri embedding of %s because its size (%dKB) exceeds IE8-safe %dKB!", filePath, fileSizeInKB, DATA_URI_MAX_KB);
                }

                return new tree.URL(filePathNode || mimetypeNode, this.currentFileInfo).eval(this.env);
            }
        }

        buf = useBase64 ? buf.toString('base64')
                        : encodeURIComponent(buf);

        var uri = "\"data:" + mimetype + ',' + buf + "\"";
        return new(tree.URL)(new(tree.Anonymous)(uri));
    };
  
  grunt.registerMultiTask('myless', 'Compile LESS files to CSS', function() {
    var done = this.async();

    var options = this.options();
    grunt.verbose.writeflags(options, 'Options');

    if (this.files.length < 1) {
      grunt.log.warn('Destination not written because no source files were provided.');
    }

    grunt.util.async.forEachSeries(this.files, function(f, nextFileObj) {
      var destFile = f.dest;

      var files = f.src.filter(function(filepath) {
        // Warn on and remove invalid source files (if nonull was set).
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      });

      if (files.length === 0) {
        if (f.src.length < 1) {
          grunt.log.warn('Destination not written because no source files were found.');
        }

        // No src files, goto next target. Warn would have been issued above.
        return nextFileObj();
      }

      var compiled = [];
      grunt.util.async.concatSeries(files, function(file, next) {
        compileLess(file, options, function(css, err) {
          if (!err) {
            compiled.push(css);
            next();
          } else {
            nextFileObj(err);
          }
        });
      }, function() {
        if (compiled.length < 1) {
          grunt.log.warn('Destination not written because compiled files were empty.');
        } else {
          grunt.file.write(destFile, compiled.join(grunt.util.normalizelf(grunt.util.linefeed)));
          grunt.log.writeln('File ' + destFile.cyan + ' created.');
        }
        nextFileObj();
      });

    }, done);
  });

  var compileLess = function(srcFile, options, callback) {
  
    options = grunt.util._.extend({filename: srcFile}, options);
    options.paths = options.paths || [path.dirname(srcFile)];
    
    var css;
    var srcCode = grunt.file.read(srcFile);

    //console.log('parser options is:');
    //console.log(grunt.util._.pick(options, lessOptions.parse));
    var parser = new less.Parser(grunt.util._.pick(options, lessOptions.parse));

    parser.parse(srcCode, function(parse_err, tree) {
      if (parse_err) {
        console.log(parse_err);
        lessError(parse_err);
        callback('',true);
      }

      try {
        css = tree.toCSS(grunt.util._.pick(options, lessOptions.render));
        callback(css, null);
      } catch (e) {
        lessError(e);
        callback(css, true);
      }
    });
  };

  var formatLessError = function(e) {
    var pos = '[' + 'L' + e.line + ':' + ('C' + e.column) + ']';
    return e.filename + ': ' + pos + ' ' + e.message;
  };

  var lessError = function(e) {
    var message = less.formatError ? less.formatError(e) : formatLessError(e);

    grunt.log.error(message);
    grunt.fail.warn('Error compiling LESS.');
  };
};
