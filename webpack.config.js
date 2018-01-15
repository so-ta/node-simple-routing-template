/**
 * Created by souta on 2018/01/14.
 */
'use strict';

var path = require('path');

module.exports = [{
	context: __dirname + '/src',
	entry: {
		'index': './scripts/entry.js'
	},
	output: {
		path: __dirname + '/public',
		filename: "./scripts/bundle.js"
	}
}];

