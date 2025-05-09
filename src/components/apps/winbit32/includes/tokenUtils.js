// tokenUtils.js


export const convertToIdentFormat = (symbol, chain, address) => {
	if (address) {
		return `${chain.toUpperCase()}.${symbol.toUpperCase()}-${address.toUpperCase().replace("0X", "0x")}`;
	} else {
		return `${chain.toUpperCase()}.${symbol.toUpperCase()}`;
	}
};

// Cache for categories
const categoriesCache = {
	data: null,
	timestamp: 0
};
const CATEGORIES_CACHE_DURATION = 3600000; // 1 hour

export const fetchCategories = async () => {
	// Check cache first
	if (categoriesCache.data && (Date.now() - categoriesCache.timestamp < CATEGORIES_CACHE_DURATION)) {
		return categoriesCache.data;
	}

	try {
		const response = await fetch(
			"https://api.coingecko.com/api/v3/coins/categories"
		);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText}`);
		}
		
		const data = await response.json();
		
		// Update cache
		categoriesCache.data = data;
		categoriesCache.timestamp = Date.now();
		
		return data;
	} catch (error) {
		console.error("Error fetching categories:", error);
		
		// Return cached data if available, even if expired
		if (categoriesCache.data) {
			return categoriesCache.data;
		}
		
		// Return empty array if no cached data
		return [];
	}
};

export const getTokenFromIdentifier = (tokens, identifier) => {

		if(!tokens){
			console.log("Tokens not found");
			return;
		}

		const token = tokens.find(
			(token) => token.identifier.toLowerCase() === identifier.toLowerCase()
		);
		if(!token){
			console.log("Token not found for identifier: ", identifier);
			return;
		}

		token.identifier = token.identifier.replace('0X', '0x')

		console.log("Token found for identifier: ", identifier, token);	

		return token;
};

export const fetchTokensByCategory = async (category) => {
	const response = await fetch(
		`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category}&order=market_cap_desc&per_page=100&page=1&sparkline=false`
	);
	const data = await response.json();

	if (!data || data.length === 0) {
		console.error("Error fetching tokens by category:", data);
		return [];
	}
	
	return data.map((token) => ({
		identifier: convertToIdentFormat(
			token.symbol,
			token.platform ? token.platform.id : "",
			token.contract_address
		),
		...token,
	}));
};

export const chainImages = {
	BTC: "https://static.thorswap.net/token-list/images/btc.btc.png",
	ETH: "https://static.thorswap.net/token-list/images/eth.eth.png",
	ARB: "https://static.thorswap.net/token-list/images/arb.arb-0x912ce59144191c1204e64559fe8253a0e49e6548.png",
	MAYA: "https://static.thorswap.net/token-list/images/maya.maya.png",
	BSC: "https://static.thorswap.net/token-list/images/bsc.png",
	AVAX: "https://static.thorswap.net/token-list/images/avax.avax.png",
	DOGE: "https://static.thorswap.net/token-list/images/doge.doge.png",
	DOT: "https://static.thorswap.net/token-list/images/dot.dot.png",
	KUJI: "https://static.thorswap.net/token-list/images/kuji.kuji.png",
	BCH: "https://static.thorswap.net/token-list/images/bch.bch.png",
	LTC: "https://static.thorswap.net/token-list/images/ltc.ltc.png",
	DASH: "https://static.thorswap.net/token-list/images/dash.dash.png",
	COSMOS: "https://static.thorswap.net/token-list/images/gaia.atom.png",
	THOR: "https://static.thorswap.net/token-list/images/thor.rune.png",
	BNB: "https://static.thorswap.net/token-list/images/bnb.bnb.png",
	GAIA: "https://static.thorswap.net/token-list/images/gaia.atom.png",
	XRD: "https://storage.googleapis.com/token-list-swapkit-dev/images/xrd.xrd.png",
	SOL: "https://static.thorswap.net/token-list/images/sol.sol.png",
	BASE: "https://static.thorswap.net/token-list/images/base.base.png",
};

export 	const fetchTokenPrices = async (swapFrom, swapTo) => {
	try {
		swapFrom.identifier = swapFrom.identifier.replace('0X', '0x');
		swapTo.identifier = swapTo.identifier.replace('0X', '0x');

		const response = await fetch("https://api.swapkit.dev/price", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "ea7d4900-6dbb-400c-b218-24cebc370bfd",
			},
			body: JSON.stringify({
				tokens: [
					{ identifier: swapFrom.identifier },
					{ identifier: swapTo.identifier },
				],
				metadata: true,
			}),
		});

		const data = await response.json();

		if (!data || data.length < 2) {
			console.error("Error fetching token prices:", data);
			return { fromPrice: 0, toPrice: 0 };
		}


		const fromPrice =
			data.find((item) => item.identifier.toUpperCase() === swapFrom.identifier.toUpperCase())?.price_usd ||
			0;
		const toPrice =
			data.find((item) => item.identifier.toUpperCase() === swapTo.identifier.toUpperCase())?.price_usd ||
			0;
		console.log(
			"Token prices:",
			swapFrom.identifier,
			fromPrice,
			swapTo.identifier,
			toPrice
		);
		return { fromPrice, toPrice };
	} catch (error) {
		console.error("Error fetching token prices:", error);
		return { fromPrice: 0, toPrice: 0 };
	}
};

// Update price caching logic
const priceCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

const getCachedPrice = (identifier) => {
	if (!identifier) return null;
	const key = identifier.toLowerCase();
	const cached = priceCache.get(key);
  
	if (!cached) return null;
	if (Date.now() - cached.timestamp > CACHE_DURATION) {
		priceCache.delete(key);
		return null;
	}
  
	return cached;
};

/**
 * Fetch token prices with chunking strategy to handle API failures
 * Recursively splits problematic chunks until we identify and isolate problem tokens
 */
const fetchTokenPriceChunk = async (tokenChunk, retryDepth = 0) => {
	try {
		if (tokenChunk.length === 0) return [];
		
		// Maximum retry depth to prevent infinite recursion
		if (retryDepth > 3) {
			console.warn(`Maximum retry depth reached for tokens: ${tokenChunk.join(', ')}`);
			return tokenChunk.map(token => ({
				identifier: token,
				price_usd: 0,
				time: Date.now(),
				failed: true
			}));
		}

		// Prepare token identifiers for API call
		const tokenIdentifiers = tokenChunk.map((token) => ({ identifier: token }));
		const now = Date.now();

		// Fetch fresh prices from API
		const response = await fetch("https://api.swapkit.dev/price", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "ea7d4900-6dbb-400c-b218-24cebc370bfd",
			},
			body: JSON.stringify({
				tokens: tokenIdentifiers,
				metadata: true,
			}),
		});

		// Handle API errors
		if (!response.ok) {
			if (response.status === 500) {
				// If there's only one token that failed, mark it as problematic and return
				if (tokenChunk.length === 1) {
					console.warn(`Token ${tokenChunk[0]} caused API error`);
					return [{
						identifier: tokenChunk[0],
						price_usd: 0,
						time: now,
						failed: true
					}];
				}

				// Split the chunk in half and try each half separately
				const midpoint = Math.ceil(tokenChunk.length / 2);
				const firstHalf = tokenChunk.slice(0, midpoint);
				const secondHalf = tokenChunk.slice(midpoint);

				console.log(`Splitting problematic chunk of ${tokenChunk.length} tokens into chunks of ${firstHalf.length} and ${secondHalf.length}`);
				
				// Recursively process both halves
				const firstResults = await fetchTokenPriceChunk(firstHalf, retryDepth + 1);
				const secondResults = await fetchTokenPriceChunk(secondHalf, retryDepth + 1);
				
				return [...firstResults, ...secondResults];
			} else {
				// For other errors, throw to be caught by the outer catch
				throw new Error(`API request failed with status ${response.status}`);
			}
		}

		// Process successful response
		const data = await response.json();
		return data.map((item) => {
			const result = {
				identifier: item.identifier,
				price_usd: item.price_usd,
				time: now
			};
			
			// Update cache with new values
			priceCache.set(item.identifier.toLowerCase(), {
				price: item.price_usd,
				timestamp: now
			});
			
			return result;
		});
	} catch (error) {
		console.error(`Error fetching chunk of ${tokenChunk.length} tokens:`, error);
		
		// For network errors or other issues, if it's a single token, mark as failed
		if (tokenChunk.length === 1) {
			return [{
				identifier: tokenChunk[0],
				price_usd: 0,
				time: Date.now(),
				failed: true
			}];
		}
		
		// Otherwise split and retry
		const midpoint = Math.ceil(tokenChunk.length / 2);
		const firstHalf = tokenChunk.slice(0, midpoint);
		const secondHalf = tokenChunk.slice(midpoint);
		
		console.log(`Splitting error chunk of ${tokenChunk.length} tokens into chunks of ${firstHalf.length} and ${secondHalf.length}`);
		
		const firstResults = await fetchTokenPriceChunk(firstHalf, retryDepth + 1);
		const secondResults = await fetchTokenPriceChunk(secondHalf, retryDepth + 1);
		
		return [...firstResults, ...secondResults];
	}
};

export const fetchMultipleTokenPrices = async (tokens) => {
	try {
		// Deduplicate tokens
		const uniqueTokens = [...new Set(tokens.map(t => t))].slice(0, 10);
		
		// Get currently valid cached prices
		const now = Date.now();
		const cached = new Map();
		const toFetch = [];

		uniqueTokens.forEach(token => {
			const cachedData = getCachedPrice(token);
			if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
				cached.set(token, cachedData);
			} else {
				toFetch.push(token);
			}
		});

		// Only fetch if we have uncached tokens
		if (toFetch.length === 0) {
			return uniqueTokens.map(token => ({
				identifier: token,
				price_usd: cached.get(token)?.price || 0,
				time: now
			}));
		}
		
		// Fetch prices with chunking strategy
		const fetchedResults = await fetchTokenPriceChunk(toFetch);

		// Combine fetched results with cached results
		const tokenUSDPrices = uniqueTokens.map(token => {
			const fetchedItem = fetchedResults.find(item => 
				item.identifier.toLowerCase() === token.toLowerCase()
			);
			
			if (fetchedItem) {
				return fetchedItem;
			}
			
			return {
				identifier: token,
				price_usd: cached.get(token)?.price || 0,
				time: now
			};
		});

		console.log("Token prices:", tokenUSDPrices);
		return tokenUSDPrices;
	
	} catch (error) {
		console.error("Error fetching token prices:", error);
		return [];
	}
};