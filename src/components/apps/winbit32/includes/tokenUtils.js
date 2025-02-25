// tokenUtils.js

export const convertToIdentFormat = (symbol, chain, address) => {
	if (address) {
		return `${chain.toUpperCase()}.${symbol.toUpperCase()}-${address.toUpperCase().replace("0X", "0x")}`;
	} else {
		return `${chain.toUpperCase()}.${symbol.toUpperCase()}`;
	}
};

export const fetchCategories = async () => {
	const response = await fetch(
		"https://api.coingecko.com/api/v3/coins/categories"
	);
	const data = await response.json();

	return data;
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

export const fetchMultipleTokenPrices = async (tokens) => {
  // Deduplicate tokens
  const uniqueTokens = [...new Set(tokens.map(t => t.toLowerCase()))];
  
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

  // ... rest of fetchMultipleTokenPrices function ...
};