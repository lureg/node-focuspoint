/*
 * node-focuspoint
 * https://github.com/SimonDegraeve/node-focuspoint
 *
 * Copyright 2014, Simon Degraeve
 * Licensed under the MIT license.
 */

'use strict';

// Dependencies
var Canvas = require('canvas');
var pica = require('pica');
var chalk = require('chalk');
var extend = require('util')._extend;
// jshint -W079:start
var Image = Canvas.Image;
// jshint -W079:end

module.exports = focuspoint;

function parseBytes(buffer) {
  const result = [];
  for (const elem of buffer) {
    let byte = elem.toString(16);
    if ( byte.length < 2) {
      byte = '0'+byte;
    }
    result.push(byte);
  }
  return result;
}

function focuspoint(imageBuffer, size, options, callback) {
  // Start time counter
  var startTotalDate = new Date();

  // Set third argument as callback if function
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  callback = callback || function() {};

  // Handle invalid mimetype
  const magicnumber = parseBytes(imageBuffer.slice(0,8)).join('');
  let mimetype;
  if(magicnumber.startsWith('47494638')) {
    mimetype = 'image/gif';
  } else if( magicnumber.startsWith('49492a00')) {
    mimetype = 'image/tiff';
  } else if(magicnumber.startsWith('ffd8ff')) {
    mimetype = 'image/jpeg'
  } else if(magicnumber.startsWith('424d')) {
    mimetype = 'image/bmp'
  } else if(magicnumber.startsWith('00000100')) {
    mimetype = 'image/ico'
  } else if(magicnumber.startsWith('89504e470d0a1a0a')) {
    mimetype = 'image/png'
  } else if(magicnumber.startsWith('3c3f786d6c') || magicnumber.startsWith('3c737667')) {
    mimetype = 'image/svg'
  }
  if (['image/jpeg', 'image/png'].indexOf(mimetype) === -1) {
    callback('File not supported (' + mimetype + ')', null);
    return;
  }

  const done = function(error, result) {
    if (!options.quiet) {
    console.log(new Array(20).join('-'));
    console.log('Done in ' + chalk.magenta('%d ms'), new Date() - startTotalDate);
    }
    callback(error, result);
    return;
  }

  // Set default options
  var defaults = {
    // directory: path.dirname(imageBuffer),
    prefix: '',
    suffix: '-[size]-focused',
    focusX: 50,
    focusY: 50,
    quality: 3, // 0..3
    alpha: false,
    unsharpAmount: 0, // 0..500
    unsharpThreshold: 0, // 0..100,
    quiet: false
  };
  options = extend(defaults, options || {});

  // Create image
  var image = new Image();
  image.src = imageBuffer;

  // Create canvas
  var canvas = new Canvas();
  var buffer = new Canvas();

  // Loop for each size
  size = size || image.width + 'x' + image.height;

  // Start time counter
  var startDate = new Date();

  // Parse size
  var targetWidth = parseInt(size.split('x')[0], 10);
  var targetHeight = parseInt(size.split('x')[1], 10);

  // Upscale image if needed
  var scaledSize = getScaledSize([image.width, image.height], [targetWidth, targetHeight]);
  var width = scaledSize[0];
  var height = scaledSize[1];

  // Set ratio
  var widthRatio = width / targetWidth;
  var heightRatio = height / targetHeight;
  var ratio = 1;
  if (width > targetWidth && height > targetHeight) {
    ratio = widthRatio > heightRatio ? heightRatio : widthRatio;
  }

  // Resize from canvas to buffer
  canvas.width = width;
  canvas.height = height;
  buffer.width = canvas.width / ratio;
  buffer.height = canvas.height / ratio;
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);

  pica.resizeCanvas(canvas, buffer, {
    quality: options.quality,
    alpha: options.alpha,
    unsharpAmount: options.unsharpAmount,
    unsharpThreshold: options.unsharpThreshold
  }, function(error) {
    if (error) {
      done(error,null);
      return;
    }

    // Translate % focus to px
    var focusPxX = (buffer.width / 100) * boundPercentage(options.focusX);
    var focusPxY = (buffer.height / 100) * boundPercentage(options.focusY);

    // Default shift to max left
    var shiftX = 0;
    var shiftY = 0;

    // If cropped horizontal and focus is bigger than first half
    if (buffer.width - targetWidth !== 0 && focusPxX > targetWidth / 2) {
      // If focus is bigger than last half
      if (focusPxX > buffer.width - (targetWidth / 2)) {
        shiftX = -(buffer.width - targetWidth); // Shift to max right
      } else {
        shiftX = -(focusPxX - (targetWidth / 2)); // Shift to middle
      }
    }

    // If cropped vertical and focus is bigger than first half
    if (buffer.Height - targetHeight !== 0 && focusPxY > targetHeight / 2) {
      // If focus is bigger than last half
      if (focusPxY > buffer.height - (targetHeight / 2)) {
        shiftY = -(buffer.height - targetHeight); // Shift to max bottom
      } else {
        shiftY = -(focusPxY - (targetHeight / 2)); // Shift to middle
      }
    }

    // Crop
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext('2d').drawImage(buffer, shiftX, shiftY, buffer.width, buffer.height);

    // Save to file
    // var outputBuffer = new Buffer();
    var stream;
    if (mimetype === 'image/jpeg') {
      stream = canvas.createJPEGStream({
        bufsize: 4096,
        quality: 100,
        progressive: true
      });
    } else if (mimetype === 'image/png') {
      stream = canvas.createPNGStream();
    }
    const outputParts = []
    stream
      .on('data', function(data) {
          outputParts.push(data);
      })
      .on('error', function(error) {
        done(error,null);
        return;
      })
      .on('end', function() {
        if (!options.quiet) {
          console.log('- %s in ' + chalk.magenta('%d ms'), size, new Date() - startDate);
        }
        done(null,Buffer.concat(outputParts));
        return;
      });
  });

}

function boundPercentage(percentage) {
  return Math.max(Math.min(percentage, 100), 0);
}

function getScaledSize(size, targetSize) {
  var bigger = targetSize.indexOf(Math.max.apply(0, targetSize));
  var smaller = bigger === 0 ? 1 : 0;
  if (targetSize[bigger] > size[bigger]) {
    size[smaller] *= targetSize[bigger] / size[bigger];
    size[bigger] = targetSize[bigger];
  }
  if (targetSize[smaller] > size[smaller]) {
    size[bigger] *= targetSize[smaller] / size[smaller];
    size[smaller] = targetSize[smaller];
  }
  return size;
}
