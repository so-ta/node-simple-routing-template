/**
 * Created by souta on 2018/01/14.
 */
'use strict';

var path = require('path'),
	ExtractTextPlugin = require('extract-text-webpack-plugin'),
	CopyWebpackPlugin = require('copy-webpack-plugin');


module.exports = [{
	context: __dirname + '/src',
	entry: {
		'index': './scripts/entry.js'
	},
	output: {
		path: __dirname + '/public',
		filename: "./scripts/bundle.js"
	}
}, {
	entry: {
		'style': path.join(__dirname, 'src', 'styles', 'index.scss')
	},
	output: {
		path: path.join(__dirname, 'public'),
		filename: 'styles/[name].css'
	},
	devtool: 'source-map',
	module: {
		rules: [
			{
				test: /\.scss$/,
				use: ExtractTextPlugin.extract(
					{
						fallback: 'style-loader',
						use: [
							{
								loader: 'css-loader',
								options: {
									sourceMap: true
								}
							},
							{
								loader: 'sass-loader',
								options: {
									sourceMap: true,
									outputStyle: "compressed"
								}
							}
						]
					}
				)
			}
		]
	},
	plugins: [
		new ExtractTextPlugin('styles/[name].css'),
		new CopyWebpackPlugin([{
			from: 'src/images',
			to: 'images'
		}])
	]
}];
