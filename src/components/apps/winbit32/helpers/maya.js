//https://mayanode.mayachain.info/mayachain
const mayanodeBaseUrl = "https://mayanode.mayachain.info/mayachain";

// export function getInboundAddresses(params?: ThornodeEndpointParams) {
//   return RequestClient.get<InboundAddressesItem[]>(`${baseUrl(params)}/inbound_addresses`);
// }

export async function getInboundAddresses() {
	const fetch = require("fetch-retry")(global.fetch);

	//use fetch instead of RequestClient
	const result = await fetch(
		`${mayanodeBaseUrl}/inbound_addresses`);
		
	//read body of response
	const data = await result.json();

	return data;

}


export async function mayaRadixRouter() {
	const data = await getInboundAddresses();
	console.log('data',data);
	const chainData = data.find((item) => item.chain === 'XRD');

	return chainData?.router;

}

export async function getQuoteFromMaya(quoteParams, swapTo, swapFrom){
	//https://mayanode.mayachain.info/mayachain/quote/swap?from_asset=XRD.XRD&to_asset=MAYA.CACAO&amount=2000000000&destination=maya1jpvhncl60k5q3dljw354t0ccg54j3pkjcag9ef&affiliate_bps=44&affiliate=cs

		// const quoteParams = {
		// 	sellAsset: swapFrom.identifier,
		// 	buyAsset: swapTo.identifier,
		// 	sellAmount: parseFloat(amount).toString(),
		// 	sourceAddress: chooseWalletForToken(swapFrom, wallets)?.address,
		// 	destinationAddress: thisDestinationAddress,
		// 	affiliateFee: basisPoints,
		// 	affiliate: "be",
		// 	slippage: slippage,
		// 	//  providers: ["MAYACHAIN"],
		// };

	const fetch = require("fetch-retry")(global.fetch);

	const apiUrl = "https://mayanode.mayachain.info/mayachain"; // Adjust this URL as needed
	//convert number strings to numbers
	const mayaQuoteParams = {
		from_asset: swapFrom.identifier,
		to_asset: swapTo.identifier,
		amount: quoteParams.assetValue.getBaseValue("string"),
		destination: quoteParams.destinationAddress,
		// affiliate_bps: quoteParams.affiliateFee,
		// affiliate: quoteParams.affiliate,
		tollerace_bps: quoteParams.slippage * 100,
	};

	const response = await fetch(`${apiUrl}/quote/swap?`+new URLSearchParams(mayaQuoteParams), {
		method: "GET",
		retries: 5,
		retryDelay: function(attempt, error, response) {
			const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
			console.log(`Retrying in ${delay}ms`, error, response);
			return delay;
		},
			retryOn: [504],
	});

	if (!response.ok) {
		throw new Error("Failed to fetch quote");
	}

	const body = await response.json();

	

//Returns:
// {
//   "inbound_address": "account_rdx16y4jvsu6jlvlr96phwdw3r4agn8pydx96rf63uk8gdxtx8044ld3u9",
//   "outbound_delay_blocks": 0,
//   "outbound_delay_seconds": 0,
//   "fees": {
//     "asset": "MAYA.CACAO",
//     "affiliate": "33453730",
//     "outbound": "2000000000",
//     "liquidity": "439348",
//     "total": "2033893078",
//     "slippage_bps": 5,
//     "total_bps": 2118
//   },
//   "expiry": 1724928768,
//   "warning": "Do not cache this response. Do not send funds after the expiry.",
//   "notes": "",
//   "recommended_min_amount_in": "175961500865",
//   "recommended_gas_rate": "750000000",
//   "gas_rate_units": "costunits",
//   "memo": "=:MAYA.CACAO:maya1jpvhncl60k5q3dljw354t0ccg54j3pkjcag9ef::cs:44",
//   "expected_amount_out": "5565003485",
//   "max_streaming_quantity": 0,
//   "streaming_swap_blocks": 0
// }
//Required format
	// [
	// 	{
	// 		providers: ["MAYACHAIN"],
	// 		sellAsset: "MAYA.CACAO",
	// 		sellAmount: "351.83",
	// 		buyAsset: "THOR.RUNE",
	// 		expectedBuyAmount: "55.00266173",
	// 		expectedBuyAmountMaxSlippage: "53.35258187",
	// 		sourceAddress: "maya17a2dfukaum4f0c2dxvjw37mn35c2yal2yq7wja",
	// 		destinationAddress: "thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd",
	// 		expiration: "1724932856",
	// 		memo: "=:THOR.RUNE:thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd:5335258187:be:32",
	// 		fees: [
	// 			{
	// 				type: "liquidity",
	// 				amount: "0.00137259",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "outbound",
	// 				amount: "0.0231",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "affiliate",
	// 				amount: "0.17674489",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "inbound",
	// 				amount: "0.2",
	// 				asset: "MAYA.CACAO",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 		],
	// 		estimatedTime: {
	// 			inbound: 6,
	// 			swap: 6,
	// 			outbound: 12,
	// 			total: 24,
	// 		},
	// 		totalSlippageBps: 36,
	// 		legs: [
	// 			{
	// 				provider: "MAYACHAIN",
	// 				sellAsset: "MAYA.CACAO",
	// 				sellAmount: "351.83",
	// 				buyAsset: "THOR.RUNE",
	// 				buyAmount: "55.00266173",
	// 				buyAmountMaxSlippage: "53.35258187",
	// 				fees: [
	// 					{
	// 						type: "liquidity",
	// 						amount: "0.00137259",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 					{
	// 						type: "outbound",
	// 						amount: "0.0231",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 					{
	// 						type: "affiliate",
	// 						amount: "0.17674489",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 				],
	// 			},
	// 		],
	// 		warnings: [],
	// 		meta: {
	// 			priceImpact: -0.36,
	// 			assets: [
	// 				{
	// 					asset: "MAYA.CACAO",
	// 					price: 0.642591,
	// 					image:
	// 						"https://storage.googleapis.com/token-list-swapkit/images/maya.cacao.png",
	// 				},
	// 				{
	// 					asset: "THOR.RUNE",
	// 					price: 4.13456639,
	// 					image:
	// 						"https://storage.googleapis.com/token-list-swapkit/images/thor.rune.png",
	// 				},
	// 			],
	// 		},
	// 		originalMemo:
	// 			"=:THOR.RUNE:thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd:5335258187:be:32",
	// 		optimal: true,
	// 	},
	// 	{
	// 		providers: ["MAYACHAIN_STREAMING"],
	// 		sellAsset: "MAYA.CACAO",
	// 		sellAmount: "351.83",
	// 		buyAsset: "THOR.RUNE",
	// 		expectedBuyAmount: "55.00266173",
	// 		expectedBuyAmountMaxSlippage: "53.35258187",
	// 		sourceAddress: "maya17a2dfukaum4f0c2dxvjw37mn35c2yal2yq7wja",
	// 		destinationAddress: "thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd",
	// 		expiration: "1724932856",
	// 		memo: "=:THOR.RUNE:thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd:5335258187/5/1:be:32",
	// 		fees: [
	// 			{
	// 				type: "liquidity",
	// 				amount: "0.00137259",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "outbound",
	// 				amount: "0.0231",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "affiliate",
	// 				amount: "0.17674489",
	// 				asset: "THOR.RUNE",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN",
	// 			},
	// 			{
	// 				type: "inbound",
	// 				amount: "0.2",
	// 				asset: "MAYA.CACAO",
	// 				chain: "MAYA",
	// 				protocol: "MAYACHAIN_STREAMING",
	// 			},
	// 		],
	// 		estimatedTime: {
	// 			inbound: 6,
	// 			swap: 6,
	// 			outbound: 12,
	// 			total: 24,
	// 		},
	// 		totalSlippageBps: 36,
	// 		legs: [
	// 			{
	// 				provider: "MAYACHAIN_STREAMING",
	// 				sellAsset: "MAYA.CACAO",
	// 				sellAmount: "351.83",
	// 				buyAsset: "THOR.RUNE",
	// 				buyAmount: "55.00266173",
	// 				buyAmountMaxSlippage: "53.35258187",
	// 				fees: [
	// 					{
	// 						type: "liquidity",
	// 						amount: "0.00137259",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 					{
	// 						type: "outbound",
	// 						amount: "0.0231",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 					{
	// 						type: "affiliate",
	// 						amount: "0.17674489",
	// 						asset: "THOR.RUNE",
	// 						chain: "MAYA",
	// 						protocol: "MAYACHAIN",
	// 					},
	// 				],
	// 			},
	// 		],
	// 		warnings: [],
	// 		meta: {
	// 			priceImpact: -0.36,
	// 			assets: [
	// 				{
	// 					asset: "MAYA.CACAO",
	// 					price: 0.642591,
	// 					image:
	// 						"https://storage.googleapis.com/token-list-swapkit/images/maya.cacao.png",
	// 				},
	// 				{
	// 					asset: "THOR.RUNE",
	// 					price: 4.13456639,
	// 					image:
	// 						"https://storage.googleapis.com/token-list-swapkit/images/thor.rune.png",
	// 				},
	// 			],
	// 		},
	// 		originalMemo:
	// 			"=:THOR.RUNE:thor17a2dfukaum4f0c2dxvjw37mn35c2yal2yhqzyd:5335258187/5/1:be:32",
	// 		optimal: false,
	// 	},
	// ];


	//Convert to desired format
	const quotes = [
		{
			providers: ["MAYACHAIN"],
			sellAsset: quoteParams.sellAsset,
			sellAmount: quoteParams.sellAmount,
			buyAsset: quoteParams.buyAsset,
			expectedBuyAmount: body.expected_amount_out,
			expectedBuyAmountMaxSlippage: body.expected_amount_out,
			sourceAddress: quoteParams.sourceAddress,
			destinationAddress: quoteParams.destinationAddress,
			expiration: body.expiry,
			memo: body.memo,
			fees: [
				{
					type: "liquidity",
					amount: body.fees.liquidity,
					asset: quoteParams.buyAsset,
					chain: "MAYA",
					protocol: "MAYACHAIN",
				},
				{
					type: "outbound",
					amount: body.fees.outbound,
					asset: quoteParams.buyAsset,
					chain: "MAYA",
					protocol: "MAYACHAIN",
				},
				{
					type: "affiliate",
					amount: body.fees.affiliate,
					asset: quoteParams.buyAsset,
					chain: "MAYA",
					protocol: "MAYACHAIN",
				},
				{
					type: "inbound",
					amount: body.fees.total,
					asset: quoteParams.sellAsset,
					chain: "MAYA",
					protocol: "MAYACHAIN",
				},
			],
			estimatedTime: {
				inbound: 6,
				swap: 6,
				outbound: 12,
				total: 24,
			},
			totalSlippageBps: body.fees.slippage_bps,
			legs: [
				{
					provider: "MAYACHAIN",
					sellAsset: quoteParams.sellAsset,
					sellAmount: quoteParams.sellAmount,
					buyAsset: quoteParams.buyAsset,
					buyAmount: body.expected_amount_out,
					buyAmountMaxSlippage: body.expected_amount_out,
					fees: [
						{
							type: "liquidity",
							amount: body.fees.liquidity,
							asset: quoteParams.buyAsset,
							chain: "MAYA",
							protocol: "MAYACHAIN",
						},
						{
							type: "outbound",
							amount: body.fees.outbound,
							asset: quoteParams.buyAsset,
							chain: "MAYA",
							protocol: "MAYACHAIN",
						},
						{
							type: "affiliate",
							amount: body.fees.affiliate,
							asset: quoteParams.buyAsset,
							chain: "MAYA",
							protocol: "MAYACHAIN",
						},
					],
				},
			],
			warnings: [],
			meta: {
				priceImpact: -0.36,
				assets: [
					{
						asset: quoteParams.sellAsset,
						price: 0.642591,
						image:
							"https://storage.googleapis.com/token-list-swapkit/images/maya.cacao.png",
					},
					{
						asset: quoteParams.buyAsset,
						price: 4.13456639,
						image:
							"https://storage.googleapis.com/token-list-swapkit/images/thor.rune.png",
					},
				],
			},
			originalMemo: body.memo,
			optimal: true,
		},
	];

	return quotes;

}