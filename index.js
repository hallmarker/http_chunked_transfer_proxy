'use strict';

const express = require('express')
const cors = require('cors')
const http = require('http');
const fs = require('fs');
const findRemoveSync = require('find-remove');

const app = express()
app.use(cors())

const inputPort = 9090
const outputPort = 9191
const segmentBasePath = 'data'

let connections = {}
let segments = {}

// ###################################################################################
// Input facing server
// ###################################################################################

let inputApp = http.createServer((request, response) => {
    const { headers, method, url } = request;

    if (method == 'DELETE') {
        request.on('error', (err) => {
            console.error(err);
        }).on('data', () => {
            response.statusCode = 200
            response.end()
        }).on('end', () => {
            response.statusCode = 202
            response.end()
        })
    }
    else { // PUT or POST
        let segmentUrl = url.replace('//', '/')
        console.log(method, ' chunk for segment:', segmentUrl)

        request.on('error', (err) => {
            console.error(err);
        }).on('data', (chunk) => {
            //console.log(segmentUrl)
            if (!segments.hasOwnProperty(segmentUrl)) {
                segments[segmentUrl] = new Array()
            }
            segments[segmentUrl].push(chunk)

            // Send chunk to open connections
            if (connections.hasOwnProperty(segmentUrl)) {
                for (let conn of connections[segmentUrl]) {
                    //console.log('Send chunk: ', segmentUrl)
                    conn[1].write(chunk)
                }
            }
        }).on('end', () => {
            // End chunk for open connections
            if (connections.hasOwnProperty(segmentUrl)) {
                for (let conn of connections[segmentUrl]) {
                    console.log('End Segment:', segmentUrl)
                    conn[1].end()
                }
                delete connections[segmentUrl]
            }

            // Store full segment on disk
            if (segments.hasOwnProperty(segmentUrl)) {
                let fullSegment = Buffer.concat(segments[segmentUrl])
                let segmentFilePath = segmentBasePath + segmentUrl
                fs.writeFile(segmentFilePath, fullSegment, "binary", function(err) {
                    if (err) {
                        return console.log(err);
                    }
                    //console.log('delete:', segmentUrl)
                    delete segments[segmentUrl]
                });
            }

            response.statusCode = 200;
            response.end();
        })
    }
})

inputApp.listen(inputPort, () => console.log(`Chunked-HTTP-Proxy input listening on port ${inputPort}`))


// ###################################################################################
// Output facing server
// ###################################################################################

//! Serve UTC time
app.get('/utc', (req, res) => {
    let now = new Date()
    let time = now.toISOString()
    console.log('apa:', now, time)
    res.setHeader('Content-Type', 'text/plain')
    res.write(time)
    res.end()
})

//! Serve segment requests
app.get('/:file', (req, res) => {
    console.log(req.path)

    let segmentUrl = req.path
    let segmentFilePath = segmentBasePath + segmentUrl
    try {
        if (fs.existsSync(segmentFilePath)) {
            res.sendfile(segmentFilePath)
        }
        else {
            if (segments.hasOwnProperty(segmentUrl)) {
                console.log('Has segment for:', segmentUrl, 'as chunks')
                if (!connections.hasOwnProperty(segmentUrl)) {
                    connections[segmentUrl] = []
                }
                connections[segmentUrl].push([req, res])

                for (let seg of segments[segmentUrl]) {
                    console.log('Send ongoing chunks...')
                    res.write(seg)
                }
            }
            else {
                console.log('No segment')
                res.sendStatus(415)
            }
        }
    } catch(err) {
        console.error(err)
    }
})

app.listen(outputPort, () => console.log(`Chunked-HTTP-Proxy output listening on port ${outputPort}`))

// ###################################################################################
// Segment cleanup
// ###################################################################################

// Keep segments on disk for 1 min
setInterval(function(){
    //console.log('Cleanup files')
    findRemoveSync(segmentBasePath, {age: {seconds: 60}, extensions: ['.m4s']})
}, 5000)
