// httpモジュールを読み込み、インスタンスを生成
var http = require('http');
var fs = require('fs');
var zlib = require('zlib');
var ejs = require('ejs');
var stream = require('stream');
var requestPromise = require('request-promise');

function getType(_url) {
	var types = {
		".html": "text/html",
		".css": "text/css",
		".js": "text/javascript",
		".png": "image/png",
		".gif": "image/gif",
		".svg": "svg+xml"
	};
	for (var key in types) {
		if (_url.endsWith(key)) {
			return types[key];
		}
	}
	return "text/plain";
}

// HTTPサーバーのイベントハンドラを定義
http.createServer(function (req, res) {
	var reqUrl = decodeURI(req.url);
	/* public以下のリソースに存在しているものの場合は、そのまま返す */
	var filename = "public" + reqUrl;
	if( fs.existsSync(filename) && !fs.statSync(filename).isDirectory() ){
		var data = fs.readFileSync(filename);
		res.setHeader('content-type',getType(reqUrl));
		res.end(data);
		return;
	}

	var routing = {
		"#": "App.Index",
		"accounts": {
			"#" : "Accounts.Index",
			"login" : "Accounts.Login",
			"search" : "Accounts.Search"
		}
	};

	/* ルーティング */
	var i;
	var routeString = "";
	var routes = reqUrl.split("/");
	for(i = 1; i < routes.length; i++) {
		var key = routes[i];
		if( key === "" ){
			key = "#"
		}
		switch( typeof(routing[key]) ){
			case "object":
				routing = routing[key];
				break;
			case "string":
				routeString = routing[key];
				routing = {};
				break;
			case "undefined":
				routeString = "";
				routing = {};
				break;
		}
	}
	if( routeString === "" ){
		routeString = "System.404";
	}

	var resources = {
		"App": {
			"Index": {
				"template": "app/index.ejs"
			}
		},
		"Accounts" : {
			"Index": {
				"template": "accounts/index.ejs"
			},
			"Login": {
				"api": "accounts/login",
				"template": "accounts/login.ejs"
			}
		},
		"System": {
			"404": {
				"statusCode": 404,
				"template": "errors/404.ejs"
			}
		}
	};
	/* 使用するアクションの探索 */
	var route = routeString.split(".");
	for(i = 0; i < route.length; i++) {
		resources = resources[route[i]];
	}

	var statusCode = 200;
	if( typeof(resources["statusCode"]) === "number" ){
		statusCode = resources["statusCode"];
	}
	res.statusCode = statusCode;

	var template = resources["template"];

	var apiRequest = {
		uri: 'https://qiita.com/so-ta/items/7f1b29b7d2098b5fd188.json',
		transform2xxOnly: true,
		transform: function (body) {
			return JSON.parse(body);
		}
	};

	requestPromise(apiRequest)
		.then(function (json) {
			/* render template */
			var contentTemplate = fs.readFileSync('app/views/'+template, 'utf-8');
			var contentHtml = ejs.render(contentTemplate, json);

			var headTemplate = fs.readFileSync('app/views/layouts/head.ejs', 'utf-8');
			var headHtml = ejs.render(headTemplate, {title:"タイトル"});

			var layoutTemplate = fs.readFileSync('app/views/layouts/layout.ejs', 'utf-8');
			var resultHtml = ejs.render(layoutTemplate, {content:contentHtml,head:headHtml});

			var resultStream = new stream.Readable;
			resultStream._read = function noop() {};
			resultStream.push(resultHtml);
			resultStream.push(null);

			res.setHeader('content-type','text/html; charset=utf-8');

			var acceptEncoding = req.headers['accept-encoding'] || "";
			if (acceptEncoding.match(/\bdeflate\b/)) {
				res.setHeader('content-encoding', 'deflate');
				resultStream.pipe(zlib.createDeflate()).pipe(res);
			} else if (acceptEncoding.match(/\bgzip\b/)) {
				res.setHeader('content-encoding', 'gzip');
				resultStream.pipe(zlib.createGzip()).pipe(res);
			}else{
				resultStream.pipe(res);
			}
		})
		.catch(function (err) {
			res.writeHead(500, {
				"Content-Type": "text/plain"
			});
			res.write("["+err.statusCode+"] API Request Error");
			res.end();
		});
}).listen(1337, '127.0.0.1'); // 127.0.0.1の1337番ポートで待機
