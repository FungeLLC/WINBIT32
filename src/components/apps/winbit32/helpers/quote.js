import BigNumber from "bignumber.js";
import { AssetValue } from "./assetValue";
import { BigIntArithmetics } from "./bigIntArithmetics";
import { BigIntArithmetics as SKBigIntArithmatics } from "@swapkit/sdk";
import { AssetValue as SKAssetValue } from "@swapkit/sdk";
import bigInt from "big-integer";
import { SwapSDK, Chains, Assets } from "@chainflip/sdk/swap";
import { skChainToChainflipChain, skAssetToChainflipAsset } from "../../../wallets/wallet-phantom/tools";
import { SwapKitApi as dKitApi } from '@doritokit/sdk'




export async function getQuoteFromThorSwap(quoteParams) {
	const fetch = require("fetch-retry")(global.fetch);

	//const apiUrl = "https://api.swapkit.dev"; // Adjust this URL as needed
	const apiUrl = "https://api.thorswap.net/aggregator/tokens/quote"; // Adjust this URL as needed
	//convert number strings to numbers
	quoteParams.sellAmount = Number(quoteParams.sellAmount);
	quoteParams.slippage = Number(quoteParams.slippage);

	//build url from quoteParams
	const url = new URL(apiUrl);
	Object.keys(quoteParams).forEach(key => url.searchParams.append(key, quoteParams[key]));

	//GET apiurl with dynamic quoteParams

	const response = await fetch(url, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
		retries: 5,
		retryDelay: function (attempt, error, response) {
			const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
			console.log(`Retrying in ${delay}ms`, error, response);
			return delay;
		},
	});

	console.log('response', response);

	//read body of response
	const body = await response.json();
	console.log('body', body);

	// Return the parsed quote so it can be used to update the routes list
	return body;
}

export async function getQuoteFromMaya(quoteParams) {
	const apiUrl = "https://midgard.mayachain.info/v2/quote/swap";

	const params = {
		from_asset: quoteParams.sellAsset.identifier,
		to_asset: quoteParams.buyAsset.identifier,
		amount: quoteParams.assetValue.getBaseValue("string"),
		destination: quoteParams.destinationAddress,
		slippage_bps: quoteParams.slippage * 100,
	};

	const url = new URL(apiUrl);
	Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

	const response = await fetch(url, {
		method: "GET",
		headers: { "Content-Type": "application/json" },
		retries: 5,
		retryDelay: (attempt) => Math.pow(2, attempt) * 1000
	});

	if (!response.ok) {
		throw new Error("Failed to fetch Maya quote");
	}

	const quote = await response.json();

	return {
		quoteId: new Date().getTime(),
		routes: [{
			providers: ["MAYA"],
			sellAsset: quoteParams.sellAsset,
			sellAmount: quoteParams.assetValue,
			buyAsset: quoteParams.buyAsset,
			expectedBuyAmount: amountInFloat(
				quote.expected_amount_out,
				quoteParams.buyAsset.decimals || 8
			),
			expectedBuyAmountMaxSlippage: amountInFloat(
				quote.expected_amount_out * (1 - quoteParams.slippage / 100),
				quoteParams.buyAsset.decimals || 8
			),
			EstimatedTime: 300, // Maya typically takes ~5 minutes
			totalSlippageBps: quoteParams.slippage,
			warnings: quote.warnings || [],
			fees: {
				affiliate: quote.fees?.affiliate || "0",
				outbound: quote.fees?.outbound || "0"
			},
			mayaQuote: quote
		}]
	};
}

export async function getQuoteFromSwapKit(quoteParams) {
	const fetch = require("fetch-retry")(global.fetch);

	const apiUrl = "https://api.swapkit.dev"; // Adjust this URL as needed
	//convert number strings to numbers
	//quoteParams.sellAmount = Number(quoteParams.sellAmount);
	quoteParams.slippage = Number(quoteParams.slippage);

	const response = await fetch(`${apiUrl}/quote`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(quoteParams),
		retries: 5,
		retryDelay: function (attempt, error, response) {
			const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
			console.log(`Retrying in ${delay}ms`, error, response);
			return delay;
		},
		retryOn: [504],
	});

	if (!response.ok) {
		throw new Error("Failed to fetch quote");
	}

	return await response.json();
}


export async function getQuoteFromDoritoKit(quoteParams) {
	const fetch = require("fetch-retry")(global.fetch);



	const apiUrl = "https://crunchy.dorito.club/api/";
	//convert number strings to numbers
	//quoteParams.sellAmount = Number(quoteParams.sellAmount);
	quoteParams.slippage = Number(quoteParams.slippage);
	quoteParams.includeTx = true;
	quoteParams.assetValue = null;

	//filter out ONEINCH from quoteParams.providers
	// quoteParams.providers = quoteParams.providers.filter(provider => provider !== "ONEINCH");

	console.log('quoteParams for DoritoKit', quoteParams);


	const res = await dKitApi.getSwapQuote(quoteParams);

	console.log('res', res);

	return res;


	// const response = await fetch(`${apiUrl}quote`, {
	// 	method: "POST",
	// 	headers: {
	// 		"Content-Type": "application/json",
	// 	},
	// 	body: JSON.stringify(quoteParams),
	// 	retries: 5,
	// 	retryDelay: function (attempt, error, response) {
	// 		const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
	// 		console.log(`Retrying in ${delay}ms`, error, response);
	// 		return delay;
	// 	},
	// 	retryOn: [504],
	// });

	// if (!response.ok) {
	// 	throw new Error("Failed to fetch quote");
	// }

	// return await response.json();
}



export async function getQuoteFromChainflip(quoteParams) {

	const chainflipSDK = new SwapSDK({
		broker: {
			url: "https://chainflip.winbit32.com",
			commissionBps: quoteParams.affiliateBasisPoints,
		},
		network: "mainnet",
		enabledFeatures: { dca: true },
	});

	const sellChain = skChainToChainflipChain(quoteParams.sellChain);
	const buyChain = skChainToChainflipChain(quoteParams.buyChain);
	const sellAsset = skAssetToChainflipAsset(quoteParams.sellAsset.ticker);
	const buyAsset = skAssetToChainflipAsset(quoteParams.buyAsset.ticker);




	// chainflipSDK.getQuoteV2({
	// 		srcChain: Chains.Ethereum,
	// destChain: Chains.Bitcoin,
	// srcAsset: Assets.ETH,
	// destAsset: Assets.BTC,
	// amount: (1.5e18).toString(), // 1.5 ETH
	// });

	const fillOrKillParams = {
		slippageTolerancePercent: quoteParams.slippage || 1, //only in V2
		refundAddress: quoteParams.sourceAddress,
		retryDurationBlocks: 100,
	};

	const dcaParams = {
		numberOfChunks: quoteParams.numChunks || 1,
		chunkIntervalBlocks: quoteParams.chunkIntervalBlocks || 20,
	};

	console.log('quoteParams', quoteParams);


	const params = {
		srcChain: sellChain,
		destChain: buyChain,
		srcAsset: sellAsset,
		destAsset: buyAsset,
		amount: quoteParams.assetValue.getBaseValue("string"),
		fillOrKillParams,
		dcaParams,
	};

	console.log('params', params);

	const res = await chainflipSDK.getQuoteV2(params);

	const quotes = res.quotes;

	// returns format: type BoostedQuoteDetails = {
	//     estimatedBoostFeeBps: number;
	//     maxBoostFeeBps: number;
	// };
	// interface BaseQuoteDetails {
	//     srcAsset: AssetAndChain;
	//     destAsset: AssetAndChain;
	//     depositAmount: string;
	//     intermediateAmount?: string;
	//     egressAmount: string;
	//     includedFees: SwapFee[];
	//     poolInfo: PoolInfo[];
	//     lowLiquidityWarning: boolean | undefined;
	//     estimatedDurationSeconds: number;
	//     estimatedPrice: string;
	// }
	// type WithBoostQuote<T> = Omit<T, 'boostQuote'> & BoostedQuoteDetails;
	// interface RegularQuote extends BaseQuoteDetails {
	//     type: 'REGULAR';
	//     boostQuote?: WithBoostQuote<RegularQuote>;
	// }
	// interface DCAQuote extends BaseQuoteDetails {
	//     type: 'DCA';
	//     dcaParams: DcaParams;
	//     boostQuote?: WithBoostQuote<DCAQuote>;
	// }
	console.log('quote', quotes);

	//Route format const QuoteResponseRouteItem = z.object({
	// providers: z.array(z.nativeEnum(ProviderName)),
	// sellAsset: z.string({
	// 	description: "Asset to sell",
	// }),
	// sellAmount: z.string({
	// 	description: "Sell amount",
	// }),
	// buyAsset: z.string({
	// 	description: "Asset to buy",
	// }),
	// expectedBuyAmount: z.string({
	// 	description: "Expected Buy amount",
	// }),
	// expectedBuyAmountMaxSlippage: z.string({
	// 	description: "Expected Buy amount max slippage",
	// }),
	// sourceAddress: z.string({
	// 	description: "Source address",
	// }),
	// destinationAddress: z.string({
	// 	description: "Destination address",
	// }),
	// targetAddress: z.optional(
	// 	z.string({
	// 	description: "Target address",
	// 	}),
	// ),
	// inboundAddress: z.optional(
	// 	z.string({
	// 	description: "Inbound address",
	// 	}),
	// ),
	// expiration: z.optional(
	// 	z.string({
	// 	description: "Expiration",
	// 	}),
	// ),
	// memo: z.optional(
	// 	z.string({
	// 	description: "Memo",
	// 	}),
	// ),
	// fees: FeesSchema,
	// tx: z.optional(EVMTransactionSchema),
	// transaction: z.optional(z.unknown()), // Can take many forms depending on the chains
	// estimatedTime: z.optional(EstimatedTimeSchema), // TODO remove optionality
	// totalSlippageBps: z.number({
	// 	description: "Total slippage in bps",
	// }),
	// legs: z.array(QuoteResponseRouteLegItem),
	// warnings: RouteQuoteWarningSchema,
	// meta: RouteQuoteMetadataSchema,
	// });
	//Convert to SK format
	const skQuote = {
		quoteId: new Date().getTime(),
		routes: quotes.map((quote) => {
			return {
				providers: [quote.type === "REGULAR" ? "CHAINFLIP" : "CHAINFLIP_DCA"],
				sellAsset: quoteParams.sellAsset,
				sellAmount: quoteParams.assetValue,
				buyAsset: quoteParams.buyAsset,
				expectedBuyAmount: amountInFloat(
					quote.egressAmount,
					quoteParams.buyAsset.decimals || 18
				),
				expectedBuyAmountMaxSlippage: amountInFloat(
					quote.egressAmount * (1 - quoteParams.slippage / 100),
					quoteParams.buyAsset.decimals || 18
				),
				EstimatedTime: quote.estimatedDurationSeconds,
				sourceAddress: quote.sourceAddress,
				destinationAddress: quote.destinationAddress,
				fees: quote.includedFees,
				gasFee: amountInFloat(quote.includedFees?.find(
					(fee) => fee.type === "INGRESS"
							)?.amount, quoteParams.sellAsset.decimals || 18),
				totalSlippageBps: quoteParams.slippage,
				cfQuote: quote, 
				warnings: quote.lowLiquidityWarning,
				// meta: RouteQuoteMetadataSchema,
			};
		}),
	};

	return skQuote;

}

export async function getQuoteFromThorchainDirect(quoteParams) {
  const url = new URL("https://thornode.ninerealms.com/thorchain/quote/swap");
  
  // All amounts need to be in 1e8 format for THORChain
  const amount = (Number(quoteParams.sellAmount) * 1e8).toString();
  
  url.searchParams.append("amount", amount);
  url.searchParams.append("from_asset", quoteParams.sellAsset);
  url.searchParams.append("to_asset", quoteParams.buyAsset); 
  url.searchParams.append("destination", quoteParams.destinationAddress);
  
  // Optional parameters
  if (quoteParams.affiliate) {
    url.searchParams.append("affiliate", quoteParams.affiliate);
    url.searchParams.append("affiliate_bps", quoteParams.affiliateFee.toString());
  }
  
  if (quoteParams.slippage) {
    url.searchParams.append("tolerance_bps", (quoteParams.slippage * 100).toString());
  }

  // Add streaming parameters if specified
  if (quoteParams.streaming_interval) {
    url.searchParams.append("streaming_interval", quoteParams.streaming_interval);
    url.searchParams.append("streaming_quantity", quoteParams.streaming_quantity || "0");
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Thorchain quote failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Calculate gas fee based on recommended rate
  const gasDetails = {
    recommendedRate: data.recommended_gas_rate,
    units: data.gas_rate_units,
    // Estimate size based on type of transaction
    estimatedSize: data.streaming_swap_blocks ? 250 : 150 // bytes
  };

  // Calculate estimated gas fee in native units
  const estimatedGasFee = 
    gasDetails.units === 'satsperbyte' 
      ? (gasDetails.recommendedRate * gasDetails.estimatedSize) / 1e8 // Convert sats to BTC
      : gasDetails.recommendedRate * gasDetails.estimatedSize; // For other units

  // Format the quote response
  const route = {
    providers: ["THORCHAIN"],
    sellAsset: quoteParams.sellAsset,
    buyAsset: quoteParams.buyAsset,
    sellAmount: Number(amount) / 1e8,
    expectedBuyAmount: Number(data.expected_amount_out) / 1e8,
    expectedBuyAmountMaxSlippage: Number(data.expected_amount_out) / 1e8,
    estimatedTime: Math.floor((
      Number(data.inbound_confirmation_seconds || 0) + 
      Number(data.outbound_delay_seconds || 0) + 
      Number(data.streaming_swap_seconds || 0)
    ) / 60),
    memo: data.memo,
    fees: {
      affiliate: data.fees?.affiliate || "0",
      outbound: data.fees?.outbound || "0",
      liquidity: data.fees?.liquidity || "0",
      gas: {
        ...gasDetails,
        estimated: estimatedGasFee
      },
      asset_price: data.fees?.asset_price || 1
    },
    totalSlippageBps: data.slippage_bps,
    inboundAddress: data.inbound_address,
    // Only set streaming parameters if max_streaming_quantity > 0
    streamingSwap: data.max_streaming_quantity > 0,
    streamingBlocks: data.max_streaming_quantity > 0 ? data.streaming_swap_blocks : 0,
    streamingQuantity: data.max_streaming_quantity || 0,
    thorchainQuote: data
  };

  return {
    quoteId: new Date().getTime(),
    routes: [route]
  };
}

export function amountInBigNumber(amount, decimals) {
	return new BigNumber(amount).times(new BigNumber(10).pow(decimals));
}

export function amountInBigInt(amount, decimals) {
	//amount is float
	//convert to bigint

	const bigFloatWithNoDecimals = (amount * 10 ** decimals).toFixed(0);
	console.log('bigFloatWithNoDecimals', bigFloatWithNoDecimals, decimals);
	
	//convert amount to bigint with decimals
	const bigA = new BigIntArithmetics(
		{ value: amount, decimal: decimals, decimalMultiplier: 10 ** decimals }
	);

	console.log('bigA', bigA);

	const bigIntValue = bigA.bigIntValue;

	return bigIntValue;
}

export function amountInFloat(bigIntValue, decimals) {
	//bigIntValue is bigint
	//convert to float
	// console.log('bigIntValue', bigIntValue, decimals);
	//convert amount to bigint with decimals
	const float = parseFloat(bigIntValue) / 10 ** decimals;

	return float;
}

export function assetToFloat(asset) {


	return amountInFloat(asset.bigIntValue, asset.decimal);

}



export async function getAssetValue(asset, value) {

	//value is float
	console.log('value', value, asset);
	//if value in scientific notation, convert to float
	if (value.toString().includes('e')) {
		value = parseFloat(value);
		console.log("value", value);
	}
	let assetValue;
	if (asset.chain.toUpperCase() === 'XRD') {


		// // assetValue = await AssetValue.from({
		// // 	asset: asset.identifier.toLowerCase(),
		// // 	//convert amount to bigint with decimals
		// // 	value: amountInBigInt(value, 18),
		// // 	fromBaseDecimal: 18,
		// // 	asyncTokenLookup: false,
		// // });

		//     // this.type = getAssetType(assetInfo);
		// 	// 	this.tax = tax;
		// 	// 	this.chain = assetInfo.chain;
		// 	// 	this.ticker = assetInfo.ticker;
		// 	// 	this.symbol = assetInfo.symbol;
		// 	// 	this.address = assetInfo.address;
		// 	// 	this.isSynthetic = assetInfo.isSynthetic;
		// 	// 	this.isGasAsset = assetInfo.isGasAsset;
		// 	// 	this.chainId = ChainToChainId[assetInfo.chain];

		// assetValue = new AssetValue(
		// 	 {value: amountInBigInt(value, 18), decimal: 18},
		// 	 18,
		// 	 0,
		// 	 asset.chain,
		// 	 asset.ticker,
		// 	 asset.symbol,
		// );

		// assetValue.type = 'native';
		// assetValue.tax = 0;
		// assetValue.chain = asset.chain;
		// assetValue.ticker = asset.ticker;
		// assetValue.symbol = asset.symbol;
		// assetValue.address = asset.address;
		// assetValue.isSynthetic = false;
		// assetValue.isGasAsset = true;
		// assetValue.chainId = asset.chainId;
		// assetValue.decimal = 18;
		// assetValue.decimalMultiplier = 1000000000000000000n;
		// assetValue.bigIntValue = amountInBigInt(value, 18);

		// console.log('assetValue', assetValue);
		asset.decimals = 18;

	}
	//  else{
	// 	const token = staticTokensMap.get(
	// 		asset.chain === Chain.Solana ? asset.identifier : asset.identifier.toUpperCase()
	// 	);
	// 	const tokenDecimal = token?.decimal;
	//  }
	const amountInBigIntasBigInt = amountInBigInt(value, asset.decimals);

	const amountInBigIntAsStr = amountInBigIntasBigInt.toString();

	console.log('amountInBigIntAsStr', amountInBigIntAsStr, value, asset.decimals);

	assetValue = await AssetValue.from({
		asset: asset.chain.toUpperCase() === 'SOL'? asset.identifier : 	asset.identifier.toUpperCase().replace("0X", "0x"),
		//convert amount to bigint with decimals
		value: amountInBigIntAsStr,
		fromBaseDecimal: asset.decimals,
		asyncTokenLookup: false,


	});


	// if(assetValue.decimalMultiplier !== 10 ** asset.decimals){
	// 	assetValue.decimal = assetValue.decimalMultiplier.toString().length - 1;
	// 	console.log('assetValue.decimalMultiplier differs from decimal', assetValue.decimalMultiplier);
		
	// }



	// }

	// assetValue: G;
	// address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
	// bigIntValue: 17914600000000000000n;
	// chain: "ARB";
	// chainId: "42161";
	// decimal: 18;
	// decimalMultiplier: 1000000000000000000n;
	// isGasAsset: false;
	// isSynthetic: false;
	// symbol: "USDC-0xaf88d065e77c8cc2239327c5edb3a432268e5831";
	// tax: undefined;
	// ticker: "USDC";
	// type: "ARBITRUM";

	//fix decimal, decimalMultiplier and bigIntValue to be correct decimals for asset.decimals
	const { bigIntValue, decimalMultiplier } = BigIntArithmetics.fromBigInt(
		bigInt((value * 10 ** asset.decimals).toFixed(0)), asset.decimals);

	let otherBits = {
		decimalMultiplier,
	};

	console.log('assetValue', assetValue);
	console.log('bigIntValue', bigIntValue);
	console.log('decimalMultiplier', decimalMultiplier);
	console.log('otherBits', otherBits);

	otherBits.decimalDifference = assetValue.decimal - asset.decimals;
	//if NaN set to 0
	if (isNaN(otherBits.decimalDifference)) {
		otherBits.decimalDifference = 0;
	}
	if(otherBits.decimalDifference == 0){
		const skAssetValue = await SKAssetValue.from({
			asset:
				asset.chain.toUpperCase() === "SOL"
					? asset.identifier
					: asset.identifier.toUpperCase().replace("0X", "0x"),
			//convert amount to bigint with decimals
			value: amountInBigIntAsStr,
			asyncTokenLookup: true,
		});


		const skBigInt = skAssetValue;
		console.log('skBigInt', skBigInt);
		const skbiDecimalMultiplierDifference = skBigInt.decimalMultiplier.toString().length - assetValue.decimalMultiplier.toString().length;
		console.log('skbiDecimalMultiplierDifference', skbiDecimalMultiplierDifference);
		otherBits.decimalDifference = skbiDecimalMultiplierDifference;

	}

		otherBits.decimalDifferenceDivider = bigInt(10).pow(
		otherBits.decimalDifference
	);

	otherBits.decimal = asset.decimals;

	assetValue.decimal = asset.decimals;
	assetValue.decimalMultiplier = decimalMultiplier;

	assetValue.bigIntValue = bigIntValue;

	if (assetValue.symbol === 'XRD' && assetValue.chainId === "radix-mainnet") {
		assetValue.address = 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd';
		assetValue.decimal = 0;
		assetValue.decimalMultiplier = 100000000000000000000000000n;
	}

	return { assetValue, otherBits };

}