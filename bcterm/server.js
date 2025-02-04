// server.js
// We'll use tabs, because we are civilised.

import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// Replace with your actual bitcoind RPC credentials
const RPC_USER = "your_rpc_user";
const RPC_PASS = "your_rpc_password666";
const RPC_HOST = "127.0.0.1";
const RPC_PORT = 8332;

// Basic auth header for bitcoind
const authHeader =	
	"Basic " + Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

// Stored info about the *current* best block
let storedBlockHash = null;
let blockSlices = []; // array of 10 slices
let blockDiscoveryTime = null; // when we discovered the current block

/**
 * Periodically poll bitcoind for a new best block.
 * If we get a new one, we chunk it into 10 slices.
 */
setInterval(async () => {
	try {
		const bestHash = await callBitcoin("getbestblockhash", []);
		if (bestHash && bestHash !== storedBlockHash) {
			// new block found
			storedBlockHash = bestHash;
			const fullHex = await callBitcoin("getblock", [bestHash, 0]); // raw block hex
			blockDiscoveryTime = Date.now();
			blockSlices = splitIntoTenSlices(fullHex);
			console.log(
				`New block discovered: ${bestHash}, total hex length = ${fullHex.length}`
			);
		}
	} catch (err) {
		console.error("Error polling for new block:", err.message);
	}
}, 10_000); // every 10 seconds

/**
 * Our main endpoint: /api/latestblockhex
 * Returns an object { blockHash, blockHex }
 * But 'blockHex' is just the 1/10th slice for the current minute.
 */
app.get("/api/latestblockhex", (req, res) => {
	if (!storedBlockHash || blockSlices.length === 0) {
		return res.json({
			blockHash: null,
			blockHex: "",
		});
	}

	const elapsedMs = blockDiscoveryTime ? Date.now() - blockDiscoveryTime : 0;
	// figure out which minute we're in, up to a max of 9
	const minuteIndex = Math.min(Math.floor(elapsedMs / 60_000), 9);

	const slice = blockSlices[minuteIndex] || ""; // safety fallback
	res.json({
		blockHash: storedBlockHash,
		blockHex: slice,
		minuteIndex,
	});
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
	console.log(`1/10-slice server listening on port ${PORT}`);
});

/**
 * Splits a string into 10 (nearly) equal slices.
 * The last slice might be shorter/longer by 1 char,
 * depending on the block hex length.
 */
function splitIntoTenSlices(fullHex) {
	const slices = [];
	if (!fullHex) return slices;

	const totalLen = fullHex.length;
	const sliceSize = Math.ceil(totalLen / 10);

	let start = 0;
	for (let i = 0; i < 10; i++) {
		const end = Math.min(start + sliceSize, totalLen);
		slices.push(fullHex.slice(start, end));
		start = end;
		if (end >= totalLen) break;
	}
	// If the totalLen isn't a perfect multiple of 10,
	// the last slice might be smaller or bigger. That's fine.
	return slices;
}

/**
 * Calls bitcoind RPC.
 */
async function callBitcoin(method, params = []) {
	const url = `http://${RPC_HOST}:${RPC_PORT}`;
	const bodyData = {
		jsonrpc: "1.0",
		id: "bcterm",
		method,
		params,
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: authHeader,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(bodyData),
		});
		const json = await response.json();
		if (json.error) {
			throw new Error(json.error.message);
		}
		return json.result;
	} catch (err) {
		console.error(`Error calling bitcoind: ${err.message}`);
		return null;
	}
}
