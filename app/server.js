// httpモジュールを読み込み、インスタンスを生成
var http = require('http');
var fs = require('fs');
var zlib = require('zlib');
var ejs = require('ejs');
var stream = require('stream');
var requestPromise = require('request-promise');
var cookie = require('cookie');

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

/* render template */
function render(req, res, template, json) {
  try {
    var contentTemplate = fs.readFileSync('app/views/' + template, 'utf-8');
    var contentHtml = ejs.render(contentTemplate, json);

    var headTemplate = fs.readFileSync('app/views/layouts/head.ejs', 'utf-8');
    var headHtml = ejs.render(headTemplate, {title: "タイトル"});

    var layoutTemplate = fs.readFileSync('app/views/layouts/layout.ejs', 'utf-8');
    var resultHtml = ejs.render(layoutTemplate, {content: contentHtml, head: headHtml});

    var resultStream = new stream.Readable;
    resultStream._read = function noop() {};
    resultStream.push(resultHtml);
    resultStream.push(null);

    res.setHeader('content-type', 'text/html; charset=utf-8');

    var acceptEncoding = req.headers['accept-encoding'] || "";
    if (acceptEncoding.match(/\bdeflate\b/)) {
      res.setHeader('content-encoding', 'deflate');
      resultStream.pipe(zlib.createDeflate()).pipe(res);
    } else if (acceptEncoding.match(/\bgzip\b/)) {
      res.setHeader('content-encoding', 'gzip');
      resultStream.pipe(zlib.createGzip()).pipe(res);
    } else {
      resultStream.pipe(res);
    }
  } catch (err) {
    renderError(res, err);
  }
}

function renderError(res, err) {
  console.log(err);
  res.writeHead(500, {
    "Content-Type": "text/plain"
  });
  res.write(err.toString());
  res.end();
}

/* request */
function generateRequest(method, pathDictionary, apiResource, dataString, parsedCookie) {
  var request = {
    method: method,
    transform2xxOnly: true,
    transform: function (body) {
      return JSON.parse(body);
    }
  };

  /* uri */
  for (var pathKey in pathDictionary) {
    var param = pathDictionary[pathKey];
    apiResource = apiResource.replace("{" + pathKey + "}", param);
  }
  request.uri = apiResource;

  /* body */
  if (dataString !== null) {
    request.body = JSON.parse(dataString);
    request.json = true;
  }

  /* header */
  var headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'
  };
  var cookieHeader = JSON.parse(fs.readFileSync('app/config/cookie_header.json', 'utf-8'));
  var cookieHeaderKeys = Object.keys(cookieHeader);
  for (var cookieKey in parsedCookie) {
    if (cookieHeaderKeys.indexOf(cookieKey) >= 0) {
      headers[cookieHeader[cookieKey]] = parsedCookie[cookieKey];
    }
  }
  request.headers = headers;

  return request;
}

function request(req, res, apiRequest, template) {
  requestPromise(apiRequest)
    .then(function (json) {
      render(req, res, template, json);
    })
    .catch(function (err) {
      renderError(res, err);
    });
}

function generateRouteAndPathDictionary(pathString) {
  var routes = pathString.split("/");
  var routing = JSON.parse(fs.readFileSync('app/config/routing.json', 'utf-8'));

  var routeString = "";
  var pathDictionary = {};

  for (var i = 1; i < routes.length; i++) {
    var key = routes[i];
    if (key === "") {
      key = "#"
    }
    switch (typeof(routing[key])) {
      case "object":
        routing = routing[key];
        break;
      case "string":
        routeString = routing[key];
        routing = {};
        break;
      case "undefined":

        // 「:」からはじまるkeyが存在するか判定する
        var routingKeys = Object.keys(routing);
        var keyStartWithColon = "";
        for (var j = 0; j < routingKeys.length; j++) {
          var checkedKey = routingKeys[j];
          if (checkedKey.lastIndexOf(":", 0) === 0) { //「:」からはじまる場合
            keyStartWithColon = checkedKey;
            break;
          }
        }

        //「:」からはじまるkeyがない場合break
        if (keyStartWithColon === "") {
          routeString = "";
          routing = {};
          break;
        }

        //「:」以降をkeyとしてdictに追加する
        pathDictionary[keyStartWithColon.substr(1)] = key;

        switch (typeof(routing[keyStartWithColon])) {
          case "object":
            routing = routing[keyStartWithColon];
            break;
          case "string":
            routeString = routing[keyStartWithColon];
            routing = {};
            break;
        }
        break;
    }
  }

  if (routeString === "") {
    routeString = "System.404";
  }

  var routeAndPathDictionary = {};
  routeAndPathDictionary.routeString = routeString;
  routeAndPathDictionary.pathDictionary = pathDictionary;

  return routeAndPathDictionary;
}

// HTTPサーバーのイベントハンドラを定義
http.createServer(function (req, res) {
  var reqUrl = decodeURI(req.url);

  /* public以下のリソースに存在しているものの場合は、そのまま返す */
  var filename = "public" + reqUrl;
  if (fs.existsSync(filename) && !fs.statSync(filename).isDirectory()) {
    var data = fs.readFileSync(filename);
    res.setHeader('content-type', getType(reqUrl));
    res.end(data);
    return;
  }

  var pathAndParamString = reqUrl.split("?");

  /* ルーティング */
  var routeAndPathDictionary = generateRouteAndPathDictionary(pathAndParamString[0]);
  var routeString = routeAndPathDictionary.routeString;
  var pathDictionary = routeAndPathDictionary.pathDictionary;

  var resources = JSON.parse(fs.readFileSync('app/config/resources.json', 'utf-8'));

  /* 使用するアクションの探索 */
  var route = routeString.split(".");
  for (i = 0; i < route.length; i++) {
    resources = resources[route[i]];
  }

  var statusCode = 200;
  if (typeof(resources["statusCode"]) === "number") {
    statusCode = resources["statusCode"];
  }
  res.statusCode = statusCode;

  var template = resources["template"];

  /* apiが存在しない場合は、リクエストしない */
  if (typeof(resources["api"]) === "undefined") {
    render(req, res, template, {});
    return
  }

  /* パラメタが存在する場合は追加する */
  if (pathAndParamString.length > 1) {
    resources["api"] = resources["api"] + "?" + pathAndParamString[1];
  }

  var parsedCookie = {};
  if (typeof(req["headers"]["cookie"]) !== "undefined") {
    parsedCookie = cookie.parse(req.headers.cookie);
  }

  /***** POST Request *****/
  if (req.method === 'POST') {
    var dataString = "";

    req.on('readable', function () {
      var string = req.read();
      if (string !== null) {
        dataString += string;
      }
    });

    req.on('end', function () {
      var apiRequest = generateRequest(req.method, pathDictionary, resources["api"], dataString, parsedCookie);
      request(req, res, apiRequest, template);
    });
    return
  }

  /***** GET Request *****/
  var apiRequest = generateRequest(req.method, pathDictionary, resources["api"], null, parsedCookie);
  request(req, res, apiRequest, template);

}).listen(1337, '127.0.0.1'); // 127.0.0.1の1337番ポートで待機
