/*
    I just want to add that the markdown conversion code is garbage.
    It's very unreliable, only converts a part of markdown and markdown that
    Looks fine in VSCode or on GitHub could be converted to crazy stuff with whole sections italicized and invalid links.
*/

const PORT = process.env.PORT;
if (!PORT) {
        console.log("ERROR: PORT is undefined")
        process.exit()
}

const http = require("http");
const https = require("https");
const fs = require("fs");
const PATH = require('path');
const Logger = require('./logger.js');

let logger = new Logger({ log_dir: "logs/website" })


// #################
//  Read stats, setup termination logic, and listen
// #################
// try {
//     const stat_data = fs.readFileSync(stats_path, "utf8")
//     let obj = JSON.parse(stat_data)
//     let keys = Object.keys(obj)

//     for (let i=0;i<keys.length;i++) {
//         stats[keys[i]] = obj[keys[i]]
//     }
// } catch(err) {
//     // stats not found, do nothing
// }

function OnTerminate() {
    // SaveStats()
    process.exit()
}

process.on('SIGINT', OnTerminate)
process.on('SIGHUP', OnTerminate)
process.on('SIGTERM', OnTerminate)
process.on('SIGBREAK', OnTerminate)



// returns false on failure
function is_path_sanitized(filename) {
    // https://stackoverflow.com/questions/38517506/nodejs-safest-path-and-file-handling

    // 2) Whitelisting
    let dot_count = 0;
    for(let i=0;i<filename.length;i++) {
        let chr = filename[i]
        let code = chr.charCodeAt(0)
        if (code >= "A".charCodeAt(0) && code <= "Z".charCodeAt(0))
            continue
        if (code >= "a".charCodeAt(0) && code <= "z".charCodeAt(0))
            continue
        if (code >= "0".charCodeAt(0) && code <= "9".charCodeAt(0))
            continue
        if(chr == '-' || chr == '_' || chr == '/' || chr == " ")
            continue

        if(chr == '.') {
            dot_count++;
            if(dot_count < 2)
                continue;
        }
        // bad character
        // console.log("bad char",filename, i, chr)
        return false
    }
    return true;
}
const PAGE_DIR = PATH.resolve("public")

function renderPage(filename, origin_page, depth = 0) {
    // console.log("PROC", filename, origin_page)
    if (depth > 16) {
        return ""
        // throw new Error("Maximum include depth exceeded");
    }

    const filepath = PATH.resolve(PAGE_DIR, filename);

    if (!filepath.startsWith(PAGE_DIR + PATH.sep) && filepath !== PAGE_DIR) {
        return ""
    }

    let html = fs.readFileSync(filepath, "utf8");

    html = html.replace(
        /#IF_PAGE\((.*?),\s*(.*?)\)/g,
        (_, target, value) => origin_page.indexOf(target) != -1 ? value : ""
    );

    html = html.replace(
        /#INCLUDE\((.*?)\)/g,
        (_, include) => renderPage(include.trim(), origin_page, depth + 1)
    );

    return html;
}

async function requestListener(req, res) {
    // TODO: Rate limit
    // console.log(req)
    // console.log("REQ ", req.url)
    var root = "public/";
    let url_split = req.url.split("?")
    let base_part = url_split[0];
    var path = PATH.join("public/", base_part).replaceAll("\\","/");
    
    // console.log(req.url)
    
    if(path.indexOf(root) != 0) {
        // someone is being sneaky
        // console.log("sneaky!", root, path)
        res.end()
        return;
    }

    let options = {};
    if(url_split.length>1){
        // TODO: Error handling
        let option_list = url_split[1].split("&") // can & be escaped in options?
        for(let i=0;i<option_list.length;i++) {
            let split = option_list[i].split("=")
            if(split.length == 2) {
                options[split[0]] = split[1];
            } else {
                // console.log("bad option format")
            }
        }
        // console.log("opts:",options)
    }

    if(req.method != "GET") {
        res.writeHead(404);
        res.end()
        return
    }

    
    if(base_part == "/") {
        base_part += "index.html"
        path += "index.html"
    }
    // console.log("REQ",path)


    if(is_path_sanitized(path)) {
        try {
            const ext = path.substring(path.lastIndexOf(".")+1)
            
            // console.log("Read",path, "ext",ext)
            let data = "";
            let type = "text/html";
            if(ext == "jpg") {
                type = "image/jpg"
                data = fs.readFileSync(path);
            } else if(ext == "png") {
                type = "image/png"
                data = fs.readFileSync(path);
            } else {
                if (ext == "html") {
                    type = "text/html"
                    let subpath = base_part.replaceAll("\\","/").substring(1)
                    data = renderPage(subpath, subpath)
                } else {
                    if(ext == "svg") {
                        type = "image/svg+xml"
                    } else  if(ext == "js") {
                        type = "text/javascript"
                    } else  if(ext == "css") {
                        type = "text/css"
                    }
                    data = fs.readFileSync(path, 'utf8');
                }
            }


            res.writeHead(200, {'Content-Type': type, 'Content-Length': data.length});

            res.write(data)
            res.end()
            
            // try {
            //     let ip = req.socket.remoteAddress
            //     let ips = req.headers['x-forwarded-for']
            //     if(ips != null) {
            //         first = ips.split(",")[0].trim()
            //         if(first.length > 0)
            //             ip = first;
            //     }
            //     ip = ip.split(":")[3]
            //     // console.log("IP:",ip)
            //     if(stats.addresses[ip] == undefined) {
            //         stats.addresses[ip] = 1
            //     } else {
            //         stats.addresses[ip]++
            //     }
            // } catch (err) {
            //     // do nothing
            // }
            // if(path == "public/index.html") {
            //     stats.index_requests++
            // }
            // stats.requests++

            // ScheduleStatSave()
            return
        } catch (err) {
            if (err.code == 'ENOENT') {
                // logger.info("File '" + path + "' not found")
            } else {
                logger.error(err);
            }
        }
    } else {
        logger.info("Suspicious request '"+path+"'")
        // we don't respond to suspicious requests
        res.end()
        return
    }
    res.writeHead(404)
    res.end()
    return
};

const server = http.createServer(requestListener);
server.listen(PORT, () => {
    logger.info("Server is running on", PORT);
});

