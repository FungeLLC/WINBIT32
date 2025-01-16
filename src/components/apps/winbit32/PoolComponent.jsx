import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import TokenChooserDialog from './TokenChooserDialog';
import { useIsolatedState } from '../../win/includes/customHooks';
import ProgressBar from '../../win/ProgressBar';
import './styles/SwapComponent.css';
import { getAssetValue, assetToFloat } from './helpers/quote';
import { fetchTokenPrices } from './includes/tokenUtils';
import { TransactionBuilder, RadixEngineToolkit, generateRandomNonce, ManifestBuilder, decimal, address, bucket, str } from '@radixdlt/radix-engine-toolkit';
import bigInt from 'big-integer';
import { Chain } from '@swapkit/sdk';
import { getMemoForDeposit } from '@swapkit/helpers';
import { mayaRadixRouter } from './helpers/maya'
import { getTxnUrl } from './helpers/transaction'
import DataTable, { defaultThemes } from 'react-data-table-component';
import {
	AssetValue,
	BaseDecimal,
	RequestClient,
	SwapKitNumber,
} from "@swapkit/helpers";

const calculateRedeemValues = (position) => {
	// Thorchain calculation
	if (position.chain === 'thorchain') {
		if (!position) return { asset: 0, rune: 0 };

		// Example symmetrical position
		const liquidityUnits = BigInt(position.liquidityUnits);
		const sharedUnits = BigInt(position.sharedUnits);
		const assetDepth = BigInt(position.poolAssetDepth);
		const runeDepth = BigInt(position.poolRuneDepth);

		// Use floats for intermediate calculations
		const assetShareFloat = Number(assetDepth) / Number(liquidityUnits);	 
		const runeShareFloat = Number(runeDepth) / Number(liquidityUnits) ;

		const assetShare = assetShareFloat * Number(sharedUnits);
		const runeShare = runeShareFloat * Number(sharedUnits);

		console.log('ass', assetShareFloat, 'run', runeShareFloat);

		console.log('assetShare', assetShare, 'runeShare', runeShare, 'assetDepth', assetDepth, 'runeDepth', runeDepth, 'liquidityUnits', liquidityUnits, 'sharedUnits', sharedUnits);



		return { asset: BigInt(assetShare.toFixed()), rune: BigInt(runeShare.toFixed()) };
	}

	// Maya calculation
	if (position.chain === 'maya') {
		// Asymmetric LP
		if (position.runeAdded && !position.assetAdded) {
			const runeAdded = BigInt(position.runeAdded);
			const runeWithdrawn = BigInt(position.runeWithdrawn || '0');
			return {
				asset: 0n,
				rune: runeAdded - runeWithdrawn
			};
		}

		// Symmetric LP
		if (position.runeAdded && position.assetAdded) {
			const runeAdded = BigInt(position.runeAdded);
			const runeWithdrawn = BigInt(position.runeWithdrawn || '0');
			const assetAdded = BigInt(position.assetAdded);
			const assetWithdrawn = BigInt(position.assetWithdrawn || '0');
			return {
				asset: assetAdded - assetWithdrawn,
				rune: runeAdded - runeWithdrawn
			};
		}
	}

	return { asset: 0n, rune: 0n };
};


const PoolComponent = ({ providerKey, windowId, programData }) => {
	const { skClient, tokens, wallets } = useWindowSKClient(providerKey);
	const { setPhrase, phrase, lockMode } = programData;

	const [baseAsset, setBaseAsset] = useIsolatedState(windowId, 'baseAsset', null);
	const [asset, setAsset] = useIsolatedState(windowId, 'asset', null);
	const [baseAmount, setBaseAmount] = useIsolatedState(windowId, 'baseAmount', 0);
	const [assetAmount, setAssetAmount] = useIsolatedState(windowId, 'assetAmount', 0);
	const [isTokenDialogOpen, setIsTokenDialogOpen] = useIsolatedState(windowId, 'isTokenDialogOpen', false);
	const [currentTokenSetter, setCurrentTokenSetter] = useIsolatedState(windowId, 'currentTokenSetter', null);
	const [progress, setProgress] = useIsolatedState(windowId, 'progress', 0);
	const [showProgress, setShowProgress] = useIsolatedState(windowId, 'showProgress', false);
	const [statusText, setStatusText] = useIsolatedState(windowId, 'statusText', '');
	const [txnUrls, setTxnUrls] = useIsolatedState(windowId, 'txnUrls', []);
	const [txnStatus, setTxnStatus] = useIsolatedState(windowId, 'txnStatus', '');
	const [liquidityMode, setLiquidityMode] = useIsolatedState(windowId, 'liquidityMode', 'sym'); // 'sym' or 'asym'
	const [swapInProgress, setSwapInProgress] = useIsolatedState(windowId, 'swapInProgress', false);
	const [positions, setPositions] = useIsolatedState(windowId, 'positions', []);


	useEffect(() => {
		if (progress === 100) {
			setTimeout(() => {
				setShowProgress(false);
			}, 2000);
		}
	}, [progress, setShowProgress]);


	const setTableData = useCallback(async () => {

		//Maya: https://midgard.mayachain.info/v2/member/maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw
		// {
		// 	"pools": [
		// 		{
		// 			"assetAdded": "0",
		// 			"assetAddress": "",
		// 			"assetDeposit": "0",
		// 			"assetPending": "0",
		// 			"assetWithdrawn": "0",
		// 			"cacaoDeposit": "0",
		// 			"dateFirstAdded": "1700127309",
		// 			"dateLastAdded": "1700127309",
		// 			"liquidityUnits": "712235670339",
		// 			"pool": "KUJI.KUJI",
		// 			"runeAdded": "15735511766258",
		// 			"runeAddress": "maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw",
		// 			"runePending": "0",
		// 			"runeWithdrawn": "7921625219793"
		// 		},
		// 		{
		// 			"assetAdded": "80372983",
		// 			"assetAddress": "thor1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzy2mqs7",
		// 			"assetDeposit": "80372983",
		// 			"assetPending": "0",
		// 			"assetWithdrawn": "0",
		// 			"cacaoDeposit": "50000000000",
		// 			"dateFirstAdded": "1724767492",
		// 			"dateLastAdded": "1724767492",
		// 			"liquidityUnits": "67715762408",
		// 			"pool": "THOR.RUNE",
		// 			"runeAdded": "50000000000",
		// 			"runeAddress": "maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw",
		// 			"runePending": "0",
		// 			"runeWithdrawn": "0"
		// 		},
		// 		{
		// 			"assetAdded": "38261700000",
		// 			"assetAddress": "account_rdx12ysqum0lh326w2armfett3zqqyaxythuz8du5yvqz2z5p02c8nngz8",
		// 			"assetDeposit": "38261700000",
		// 			"assetPending": "0",
		// 			"assetWithdrawn": "0",
		// 			"cacaoDeposit": "139860000000",
		// 			"dateFirstAdded": "1726759882",
		// 			"dateLastAdded": "1726759882",
		// 			"liquidityUnits": "11256345339",
		// 			"pool": "XRD.XRD",
		// 			"runeAdded": "139860000000",
		// 			"runeAddress": "maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw",
		// 			"runePending": "0",
		// 			"runeWithdrawn": "0"
		// 		}
		// 	]
		// }




		//Thor: https://mu.thorswap.net/fullmember?address=0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,ltc1qldzqzvkjpr34apsjunal2rz00pt7a3j5u86fta,0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,qqegmhe2j3fg2yn2ynr2jdlz6v3fsgamk5vztgtqrq,0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,kujira1mxxzxwx2tjxka66urvng8rfh25munacgfm8sj2,account_rdx169agd2rahzxn2kc6y2se8gqxe74pkjypnnjxr7yrrj5a4eyclsevy7,0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b,14DzBiE4ZPgbqsye5j7QiNEwTxLvPPjvgxkXuhYMSq8HmDZE,bc1qpxkvdnrlrhdfk2v7z63kp740z6c3emjhx9e3vr,DJ1D4qF2gG15MaGUVRawBs687B8U2F6zuN,maya1wr4r0hw7apejj76xlxfxaw86r2v7r0ehlrwv76,thor1wr4r0hw7apejj76xlxfxaw86r2v7r0ehl5sqg2,4rcXk5WjaHzvKA2ixoNfTmqxb6ZGkX6GWVhLDyDGVLtD,cosmos1mxxzxwx2tjxka66urvng8rfh25munacgcn9glq,cFM6U1j8NeCVukWPrhip36ry2oE9QrEHoMgrYoHq1mhaTkgvt

		// [
		// 	{
		// 		"assetAdded": "0",
		// 		"assetAddress": "",
		// 		"assetPending": "0",
		// 		"assetWithdrawn": "0",
		// 		"dateFirstAdded": "1712235217",
		// 		"dateLastAdded": "1712235217",
		// 		"pool": "ETH.FLIP-0X826180541412D574CF1336D22C0C0A287822678A",
		// 		"poolAssetDepth": "157083428688",
		// 		"poolRuneDepth": "71841564807",
		// 		"poolUnits": "88610322889",
		// 		"runeAdded": "3960000000",
		// 		"runeAddress": "thor1wr4r0hw7apejj76xlxfxaw86r2v7r0ehl5sqg2",
		// 		"runePending": "0",
		// 		"runeWithdrawn": "0",
		// 		"sharedUnits": "2313981629"
		// 	}
		// ]


		// const fetch = require("fetch-retry")(global.fetch);

		// const apiUrl = "https://mayanode.mayachain.info/mayachain"; // Adjust this URL as needed
		// //convert number strings to numbers
		// const mayaQuoteParams = {
		// 	from_asset: quoteParams.sellAsset,
		// 	to_asset: quoteParams.buyAsset,
		// 	amount: quoteParams.sellAmount,
		// 	destination: quoteParams.destinationAddress,
		// 	affiliate_bps: quoteParams.affiliateFee,
		// 	affiliate: quoteParams.affiliate,
		// };

		// const response = await fetch(`${apiUrl}/quote/swap` + new URLSearchParams(mayaQuoteParams), {
		// 	method: "GET",
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

		// export async function getLiquidityPositions(addresses: string[]) {
		// 	const rawLiquidityPositions = await getLiquidityPositionsRaw(addresses);

		// 	return rawLiquidityPositions.map((rawPosition) => ({
		// 		assetRegisteredAddress: rawPosition.assetAddress,
		// 		asset: AssetValue.from({
		// 			asset: rawPosition.pool,
		// 			value: rawPosition.assetAdded,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		assetPending: AssetValue.from({
		// 			asset: rawPosition.pool,
		// 			value: rawPosition.assetPending,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		assetWithdrawn: AssetValue.from({
		// 			asset: rawPosition.pool,
		// 			value: rawPosition.assetWithdrawn,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		runeRegisteredAddress: rawPosition.runeAddress,
		// 		rune: AssetValue.from({
		// 			asset: "THOR.RUNE",
		// 			value: rawPosition.runeAdded,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		runePending: AssetValue.from({
		// 			asset: "THOR.RUNE",
		// 			value: rawPosition.runePending,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		runeWithdrawn: AssetValue.from({
		// 			asset: "THOR.RUNE",
		// 			value: rawPosition.runeWithdrawn,
		// 			fromBaseDecimal: BaseDecimal.THOR,
		// 		}),
		// 		poolShare: new SwapKitNumber(rawPosition.sharedUnits).div(rawPosition.poolUnits),
		// 		dateLastAdded: rawPosition.dateLastAdded,
		// 		dateFirstAdded: rawPosition.dateFirstAdded,
		// 	}));
		// }



		// const body = await response.json();
		//get all addresses from wallets
		const addresses = Object.values(wallets).map(w => w.address);
		const mayaAddress = addresses.find(a => a.startsWith('maya'));

		const fetch = require("fetch-retry")(global.fetch);
		let fetchURLs = [];
		//fetch both maya and thorchain pools using fetch
		fetchURLs.push(`https://mu.thorswap.net/fullmember?address=${addresses.join(',')}`);
		if (mayaAddress) {
			fetchURLs.push(`https://midgard.mayachain.info/v2/member/${mayaAddress}`);
		}

		const responses = await Promise.all(fetchURLs.map(url => fetch(url, {
			method: "GET",
			retries: 5,
			headers: {
				"Content-Type": "application/json",
			},
			retryDelay: function (attempt, error, response) {
				const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
				console.log(`Retrying in ${delay}ms`, error, response);
				return delay;
			}
		})));

		//filter out non 200 responses
		const validResponses = responses.filter(r => r.ok);

		const bodies = await Promise.all(validResponses.map(r => r.json()));

		console.log('bodies', bodies);
		let positions = [];
		// convert to some common format
		for (const body of bodies) {
			if (!body) { continue; }
			if (body.pools) { //maya
				for (const pool of body.pools) {
					//Get proper data: https://mayanode.mayachain.info/mayachain/pool/KUJI.KUJI/liquidity_provider/maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw
				
					const mayaPoolURL = `https://mayanode.mayachain.info/mayachain/pool/${pool.pool}/liquidity_provider/${pool.runeAddress}`;
					const mayaPoolResponse = await fetch(mayaPoolURL, {
						method: "GET",
						retries: 5,
						headers: {
							"Content-Type": "application/json",
						},
						retryDelay: function (attempt, error, response) {
							const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
							console.log(`Retrying in ${delay}ms`, error, response);
							return delay;
						}
					});

					const mayaPoolBody = await mayaPoolResponse.json();
					console.log('mayaPoolBody', mayaPoolBody);
					

					// const mayaPoolBody = await mayaPoolResponse.json();
					// console.log('mayaPoolBody', mayaPoolBody);
					// {
					// 	"asset": "KUJI.KUJI",
					// 		"cacao_address": "maya1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzya9vxw",
					// 			"last_add_height": 3722586,
					// 				"last_withdraw_height": 6888996,
					// 					"units": "712235670339",
					// 						"pending_cacao": "0",
					// 							"pending_asset": "0",
					// 								"cacao_deposit_value": "1278296254580",
					// 									"asset_deposit_value": "2539558057",
					// 										"withdraw_counter": "0",
					// 											"bonded_nodes": null,
					// 												"cacao_redeem_value": "516799902207",
					// 													"asset_redeem_value": "7423811202",
					// 														"luvi_deposit_value": "0",
					// 															"luvi_redeem_value": "8696629",
					// 																"luvi_growth_pct": "0.000000000000000000"
					// }


					const position = {
						chain: 'maya',
						pool: pool.pool,
						assetAdded: pool.assetAdded,
						assetAddress: pool.assetAddress,
						assetPending: pool.assetPending,
						assetWithdrawn: pool.assetWithdrawn,
						dateFirstAdded: pool.dateFirstAdded,
						dateLastAdded: pool.dateLastAdded,
						liquidityUnits: pool.liquidityUnits,
						runeAdded: pool.runeAdded,
						runeAddress: pool.runeAddress,
						runePending: pool.runePending,
						runeWithdrawn: pool.runeWithdrawn,
						runeDeposit: pool.cacaoDeposit,

					};

				

					position.asset = AssetValue.from({
						asset: pool.pool,
						value: BigInt(mayaPoolBody.asset_redeem_value),
						BaseDecimal: BaseDecimal.MAYA,
					});
					position.base = AssetValue.from({
						asset: "MAYA.CACAO",
						value: BigInt(mayaPoolBody.cacao_redeem_value),
						BaseDecimal: BaseDecimal.MAYA,
					});



					positions.push(position);
				}
			} else if (body.length) { //thorchain
				for (const pool of body) {

					// //https://thornode.thorswap.net/thorchain/pool/ETH.FLIP-0X826180541412D574CF1336D22C0C0A287822678A/liquidity_provider/thor1wr4r0hw7apejj76xlxfxaw86r2v7r0ehl5sqg2
					// //https://mu.thorswap.net/lp_detail/thor1wr4r0hw7apejj76xlxfxaw86r2v7r0ehl5sqg2?pools=BASE.ETH

					// const thorPoolURL = `https://mu.thorswap.net/lp_detail/${pool.runeAddress}?pools=${pool.pool}`;
					// const thorPoolResponse = await fetch(thorPoolURL, {
					// 	method: "GET",
					// 	retries: 5,
					// 	headers: {
					// 		"Content-Type": "application/json",
					// 	},
					// 	retryDelay: function (attempt, error, response) {
					// 		const delay = Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
					// 		console.log(`Retrying in ${delay}ms`, error, response);
					// 		return delay;
					// 	}
					// });
					// const thorPoolBody = await thorPoolResponse.json();
					// console.log('thorPoolBody', thorPoolBody);
					// //returns:
					// //[{"assetAddress":"0xfa9836AAD0E7EC4B22EeeAdb14b860Ce23ECCa3b","assetDepth":"7398079018","assetEarned":"0","assetPrice":"966.73770198368","assetPriceUsd":"3492.9845842818772","pool":"BASE.ETH","poolUnits":"0","rewards":"0","runeAddress":"thor1wr4r0hw7apejj76xlxfxaw86r2v7r0ehl5sqg2","runeDepth":"7152001908955","runeEarned":"0","runePriceUsd":"3.6131668156879684","sharedUnits":"356889772","stakeDetail":[],"usdEarned":"0","withdrawDetail":[]}]



					const position = {
						chain: 'thorchain',
						pool: pool.pool,

						assetAdded: pool.assetAdded,
						assetAddress: pool.assetAddress,
						assetPending: pool.assetPending,
						assetWithdrawn: pool.assetWithdrawn,
						dateFirstAdded: pool.dateFirstAdded,
						dateLastAdded: pool.dateLastAdded,
						poolAssetDepth: pool.poolAssetDepth,
						poolRuneDepth: pool.poolRuneDepth,
						liquidityUnits: pool.poolUnits,
						runeAdded: pool.runeAdded,
						runeAddress: pool.runeAddress,
						runePending: pool.runePending,
						runeWithdrawn: pool.runeWithdrawn,
						sharedUnits: pool.sharedUnits,
					};

					const { asset: assetRedeemValue, rune: runeRedeemValue } = calculateRedeemValues(position);

					position.asset = AssetValue.from({
						asset: pool.pool,
						value: assetRedeemValue,
						BaseDecimal: BaseDecimal.THOR,
					});
					position.base = AssetValue.from({
						asset: "THOR.RUNE",
						value: runeRedeemValue,
						BaseDecimal: BaseDecimal.THOR,
					});

					positions.push(position);
				}
			}

		}
		console.log('positions', positions);

		setPositions(positions);





	}, [setPositions, wallets]);


	useEffect(() => {

		const timeout = setTimeout(() => {
			setTableData();
		}, 5000);

		return () => {
			clearTimeout(timeout);
		};
	}, [setTableData]);



	const openTokenDialog = (setter, toFrom) => {
		setCurrentTokenSetter(() => setter);
		setIsTokenDialogOpen(toFrom || true);
	};

	const closeTokenDialog = useCallback(() => {
		setIsTokenDialogOpen(false);
		setCurrentTokenSetter(null);
	}, []);

	const handleAddLiquidity = async () => {
		if (swapInProgress) return;
		setSwapInProgress(true);
		setShowProgress(true);
		setProgress(0);
		try {

			setTxnUrls([]);
			const baseAssetValue = await getAssetValue(baseAsset, baseAmount);
			const assetValue = await getAssetValue(asset, assetAmount);

			let lm = liquidityMode;
			if (liquidityMode === 'asym') {
				if (baseAssetValue.assetValue.bigIntValue > assetValue.assetValue.bigIntValue) {
					lm = 'baseAsset';
				} else {
					lm = 'asset';
				}


			}
			let radixWallet = skClient.getWallet('XRD');
			// const constructionMetadata = await radixWallet.api.LTS.getConstructionMetadata();

			console.log('radixWallet', radixWallet);

			// if (!lockMode || !radixWallet.transferToAddress) {
			// 	//can't do this yet
			// 	throw new Error('Wallet not supported yet');
			// }


			// const { getRadixCoreApiClient, RadixToolbox, createPrivateKey, RadixMainnet } = await import(
			// 	"@swapkit/toolbox-radix"
			// );
			// const signer = await createPrivateKey(phrase);
			// console.log('signer', signer);
			// radixWallet.oTransfer = radixWallet.transfer;
			// radixWallet.transfer = async function ({ assetValue, from, recipient, memo }) {

			// 	const assetBigInt = bigInt(assetValue.bigIntValue / 1000000000000000000n);
			// 	const assetNumber = assetBigInt.toJSNumber();

			// 	const transactionHeader = {
			// 		networkId: 1,
			// 		validFromEpoch: Number(constructionMetadata.current_epoch),
			// 		startEpochInclusive: Number(constructionMetadata.current_epoch),
			// 		endEpochExclusive: Number(constructionMetadata.current_epoch) + 100,
			// 		nonce: await generateRandomNonce(),
			// 		fromAccount: from,
			// 		signerPublicKey: signer.publicKey(),
			// 		notaryPublicKey: signer.publicKey(),
			// 		notaryIsSignatory: true,
			// 		tipPercentage: 0
			// 	};

			// 	console.log('transactionHeader', transactionHeader);
			// 	console.log('assetValue', assetValue);
			// 	memo = memo + ':be:10';

			// 	const mayaRouter = await mayaRadixRouter();


			// 	console.log('assetBigInt', assetBigInt, decimal(assetNumber.toString()), assetNumber, address(from), address(recipient), memo);

			// 	const transactionManifest = new ManifestBuilder()
			// 		.callMethod(from, "lock_fee", [
			// 			decimal(2),
			// 		])
			// 		.callMethod(from, "withdraw", [
			// 			address(assetValue.address),
			// 			decimal(assetNumber.toString()),
			// 		])
			// 		.takeAllFromWorktop(
			// 			assetValue.address,
			// 			 (builder, bucketId) => {
			// 				console.log('bucketId', bucketId, bucket(bucketId), mayaRouter);

			// 				return builder
			// 					.callMethod(mayaRouter, "user_deposit", [
			// 						address(from),
			// 						address(recipient),
			// 						bucket(bucketId),
			// 						str(memo)

			// 					])

			// 			}
			// 		)

			// 		.build();
			// 	console.log('transactionHeader', transactionHeader);
			// 	console.log('transactionManifest', transactionManifest);


			// 	const transaction = await TransactionBuilder.new()
			// 		.then(builder =>
			// 			builder
			// 				.header(transactionHeader)
			// 				.plainTextMessage(memo  || '') // Add the memo
			// 				.manifest(transactionManifest)
			// 				.sign(signer) // Sign the transaction
			// 				.notarize(signer) // Notarize the transaction
			// 		);

			// 		console.log('transaction', transaction);

			// 	const transactionId = await RadixEngineToolkit.NotarizedTransaction.intentHash(transaction);

			// 	const compiledNotarizedTransaction =
			// 		await RadixEngineToolkit.NotarizedTransaction.compile(transaction);

			// 	console.log('transactionId', transactionId, compiledNotarizedTransaction);

			// 	await radixWallet.api.LTS.submitTransaction({
			// 		notarized_transaction_hex: Buffer.from(compiledNotarizedTransaction).toString('hex'),
			// 	});
			// 	return transactionId;
			// };

			const allWallets = await skClient.getAllWallets();
			console.log('allWallets', allWallets);
			//allwallets is an object with wallet names as keys and wallet objects as values
			for (const wallet of Object.values(allWallets)) {
				if (wallet.chain === 'XRD') { continue; }

				const oMayaDeposit = wallet.deposit;
				if (oMayaDeposit) {
					if (!wallet.oDeposit) {
						wallet.oDeposit = wallet.deposit;
					}

					wallet.deposit = function (params
					) {
						params.memo = params.memo + ':be:10';
						console.log('params', params);
						return oMayaDeposit(params);
					};
				}

				const oMayaTransfer = wallet.transfer;
				if (oMayaTransfer) {
					if (!wallet.oTransfer) {
						wallet.oTransfer = wallet.transfer;
					}
					wallet.transfer = function (params
					) {
						params.memo = params.memo + ':be:10';
						console.log('params', params);
						return oMayaTransfer(params);
					};
				}
			}


			const liquidityParams = {
				baseAssetValue: baseAssetValue.assetValue,
				assetValue: assetValue.assetValue,
				assetAddr: wallets.find(w => w.chain === asset.chain).address,
				baseAssetAddr: wallets.find(w => w.chain === baseAsset.chain).address,
				mode: lm,
			};

			const pluginName = baseAsset.chain.toLowerCase() === 'maya' ? 'mayachain' : 'thorchain';

			console.log('liquidityParams', liquidityParams, pluginName);

			let addLiquidityFn = skClient[pluginName].addLiquidity;
			setProgress(13);

			if (pluginName === 'mayachain') {

				addLiquidityFn = async function addLiquidity({
					baseAssetValue,
					assetValue,
					baseAssetAddr,
					assetAddr,
					isPendingSymmAsset,
					mode = "sym",
				}) {
					const { chain, symbol } = assetValue;
					const isSym = mode === "sym";
					const baseTransfer = baseAssetValue?.gt(0) && (isSym || mode === "baseAsset");
					const assetTransfer = assetValue?.gt(0) && (isSym || mode === "asset");
					const includeBaseAddress = isPendingSymmAsset || baseTransfer;
					const baseAssetWalletAddress = skClient.getWallet(Chain.Maya).address;

					const baseAddress = includeBaseAddress ? baseAssetAddr || baseAssetWalletAddress : "";
					const assetAddress =
						isSym || mode === "asset" ? assetAddr || skClient.getWallet(chain).address : "";

					if (!(baseTransfer || assetTransfer)) {
						throw new Error("Invalid parameters for adding liquidity");
					}
					if (includeBaseAddress && !baseAddress) {
						throw new Error("Base asset address is required");
					}
					console.log('baseAddress', baseAddress, assetAddress, mode, isSym, baseTransfer, assetTransfer);
					// First transaction: transfer the asset
					let assetTx;
					if (assetTransfer && assetValue) {
						assetTx = await skClient[pluginName].depositToPool({
							assetValue,
							memo: getMemoForDeposit({ chain, symbol, address: baseAddress }),
						}).catch((err) => {
							throw new Error(`Error adding liquidity (asset): ${err.message}`, err);
						});

						// Ensure the transaction is complete before proceeding (wait 10 seconds, for example)#
						console.log('assetTx ,waiting 15', assetTx);

						await new Promise(resolve => setTimeout(resolve, 15000));
						console.log('assetTx ,waiting 15 done');
					} else {
						console.log('assetTx not required');
						assetTx = true;
					}

					// Check if the first transaction was successful before proceeding
					if (assetTx) {
						// Second transaction: transfer the base asset
						if (baseTransfer && baseAssetValue) {
							const baseAssetTx = await skClient[pluginName].depositToPool({
								assetValue: baseAssetValue,
								memo: getMemoForDeposit({ chain, symbol, address: assetAddress }),
							}).catch((err) => {
								throw new Error(`Error adding liquidity (base asset): ${err.message}`);
							});

							return { baseAssetTx, assetTx };
						}
					} else {
						console.log('assetTx failed');
					}

					return { assetTx };
				};
			}



			const { baseAssetTx, assetTx } = await addLiquidityFn(liquidityParams);

			if (baseAssetTx || assetTx) {
				const howMany = baseAssetTx && assetTx ? "two" : "one";


				setStatusText('Liquidity added successfully to ' + howMany + ' pot(s)');
				let txns = [];
				if (baseAssetTx) {
					try {
						const url = getTxnUrl(baseAssetTx, baseAsset.chain, skClient);
						txns.push(url);
					} catch (e) {
						console.error('Error getting explorer tx url:', e);
					}
				}
				if (assetTx) {
					try {
						const url = getTxnUrl(assetTx, asset.chain, skClient);
						txns.push(url);
					} catch (e) {
						console.error('Error getting explorer tx url:', e);
					}
				}
				setTxnUrls(txns);
			} else {
				setStatusText('Liquidity addition failed.');
			}

			setProgress(100);
		} catch (error) {
			console.error('Error adding liquidity:', error);
			setStatusText(`Error: ${error.message}`);
		} finally {
			setSwapInProgress(false);
			setShowProgress(false);

			//set wallets back to original
			const allWallets = await skClient.getAllWallets();
			console.log('allWallets', allWallets);
			//allwallets is an object with wallet names as keys and wallet objects as values
			for (const wallet of Object.values(allWallets)) {
				if (wallet.chain === 'XRD') { continue; }
				if (wallet.oDeposit) {
					wallet.deposit = wallet.oDeposit;
				}
				if (wallet.oTransfer) {
					wallet.transfer = wallet.oTransfer;
				}
			}

		}
	};

	const handleCalculate = async () => {
		if (!baseAsset || !asset) {
			setStatusText('Please select both base asset and asset.');
			return;
		}

		setLiquidityMode('sym');

		try {
			const { fromPrice: basePrice, toPrice: assetPrice } = await fetchTokenPrices(baseAsset, asset);
			console.log('Prices:', basePrice, assetPrice, baseAmount, assetAmount);
			const baseAmountFloat = parseFloat(baseAmount || 0);
			const assetAmountFloat = parseFloat(assetAmount || 0);

			if (baseAmountFloat === 0 && assetAmountFloat > 0) {
				const calculatedBaseAmount = (assetAmountFloat * assetPrice) / basePrice;
				setBaseAmount(calculatedBaseAmount);
				setStatusText(`Calculated Base Asset Amount: ${calculatedBaseAmount}`);
			} else if (baseAmountFloat > 0 && assetAmountFloat === 0) {
				const calculatedAssetAmount = (baseAmountFloat * basePrice) / assetPrice;
				setAssetAmount(calculatedAssetAmount);
				setStatusText(`Calculated Asset Amount: ${calculatedAssetAmount}`);
			} else if (baseAmountFloat > 0 && assetAmountFloat > 0) {
				const calculatedAssetAmount = (baseAmountFloat * basePrice) / assetPrice;
				setAssetAmount(calculatedAssetAmount);
				setStatusText(`Calculated Asset Amount: ${calculatedAssetAmount}`);
			} else {
				setStatusText('Please enter an amount for one of the assets.');
			}
		} catch (error) {
			console.error('Error calculating amounts:', error);
			setStatusText('Error calculating amounts.');
		}
	};


	const handleWithdrawLiquidity = async (position, percent) => {
		if (swapInProgress) return;

		setSwapInProgress(true);
		setShowProgress(true);
		setProgress(0);
		try {
			setTxnUrls([]);
			const baseAsset = position.base;
			const assetValue = position.asset;

			const from = wallets.find(w => w.chain === baseAsset.chain).address;
			const to = wallets.find(w => w.chain === assetValue.chain).address;

			const liquidityParams = {
				assetValue,
				percent,
				from,
				to
			};

			const pluginName = baseAsset.chain.toLowerCase() === 'maya' ? 'mayachain' : 'thorchain';

			console.log('liquidityParams', liquidityParams, pluginName);
			setProgress(13);
			skClient[pluginName].withdraw(liquidityParams).then((txn) => {
				setStatusText('Liquidity withdrawn successfully');

				setTxnUrls([getTxnUrl(txn, baseAsset.chain, skClient)]);
				setProgress(100);



			}
			).catch((error) => {
				console.error('Error withdrawing liquidity:', error);
				setStatusText(`Error: ${error.message}`);
			}).finally(() => {
				setSwapInProgress(false);
				setShowProgress(false);
			});
		} catch (error) {
			console.error('Error withdrawing liquidity:', error);
			setStatusText(`Error: ${error.message}`);
			setSwapInProgress(false);
			setShowProgress(false);
		}
	};





	const tokenChooserDialog = useMemo(() => {
		if (isTokenDialogOpen) {
			return (
				<TokenChooserDialog
					isOpen={isTokenDialogOpen}
					onClose={closeTokenDialog}
					onConfirm={token => {
						handleTokenSelect(token, currentTokenSetter, closeTokenDialog);
						setIsTokenDialogOpen(false);
					}}
					wallets={wallets}
					otherToken={baseAsset}
					windowId={windowId + '_token_chooser'}
				/>
			);
		}
		return null;
	}, [isTokenDialogOpen, wallets, baseAsset, closeTokenDialog]);

	const handleTokenSelect = (token, currentTokenSetter, closeTokenDialog) => {
		if (currentTokenSetter) {
			currentTokenSetter(token);
		}
		closeTokenDialog();
	};

	const handleBaseTokenSelect = tokenIdentifier => {
		const token = tokens.find(token => token.identifier.toLowerCase() === tokenIdentifier.toLowerCase());
		setBaseAsset(token);
	};

	const renderStatus = () => {
		if (statusText === '') {
			return null;
		}
		return (
			<div className="status-text">
				{statusText}
			</div>
		);

	};



	const customStyles = {
		header: {
			style: {
				minHeight: '56px',
			},
		},
		headRow: {
			style: {
				borderTopStyle: 'solid',
				borderTopWidth: '1px',
				borderTopColor: defaultThemes.default.divider.default,
			},
		},
		cells: {
			style: {
				'&:not(:last-of-type)': {
					borderRightStyle: 'solid',
					borderRightWidth: '1px',
					borderRightColor: defaultThemes.default.divider.default,
				},
			},
		},
	};





	const ExpandedComponent = ({ data }) => (
		<div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', 'alignItems': 'center' }}>
			{//form with button to remove liquidity with % slider
			}
			<div style={{ display: 'flex', flexDirection: 'row', 'alignItems': 'center', 'justifyContent': 'center', paddingTop: '30px', paddingBottom: '30px' }}>
				<button onClick={() => handleWithdrawLiquidity(data, 100)} disabled={swapInProgress}>Withdraw All</button>
				<button onClick={() => handleWithdrawLiquidity(data, 50)} disabled={swapInProgress}>Withdraw 50%</button>
				<button onClick={() => handleWithdrawLiquidity(data, 25)} disabled={swapInProgress}>Withdraw 25%</button>
				<button onClick={() => handleWithdrawLiquidity(data, 10)} disabled={swapInProgress}>Withdraw 10%</button>
			</div>
			{/* table with all the other data
			<div style={{ display: 'flex', flexDirection: 'column', 'alignItems': 'center' }}>
				<div>Asset: {data.asset.ticker}</div>
				<div>Asset Amount: {assetToFloat(data.asset)}</div>
				<div>Base: {data.base.ticker}</div>
				<div>Base Amount: {assetToFloat(data.base)}</div>
				<div>Pool: {data.pool}</div>
				<div>Added: {data.dateFirstAdded}</div>
				<div>Last Added: {data.dateLastAdded}</div>
				<div>Units: {data.liquidityUnits}</div>
				<div>Shared Units: {data.sharedUnits}</div>
				</div> */}



		</div>
	);

	const columns = [

		{ name: 'Asset', selector: row => row.asset.ticker, sortable: true },
		{ name: 'Asset Amount', selector: row => row.asset.bigIntValue, sortable: true, cell: row => <div>{assetToFloat(row.asset)}</div> },
		{ name: 'Base', selector: row => row.base.ticker, sortable: true },
		{ name: 'Base Amount', selector: row => row.base.bigIntValue, sortable: true, cell: row => <div>{assetToFloat(row.base)}</div> },
	];

	return (
		<div className="swap-component" style={{ display: 'flex', flexDirection: 'column' }}>
			<div className="swap-toolbar">
				<button className="swap-toolbar-button" onClick={handleAddLiquidity}>
					<div className="swap-toolbar-icon">➕</div>
					Add Liquidity
				</button>
				<button className="swap-toolbar-button" onClick={handleCalculate}>
					<div className="swap-toolbar-icon">🧮</div>
					Calculate
				</button>
				{txnUrls.map((txnHash, index) => (
					<button className="swap-toolbar-button" onClick={() => window.open(txnHash, '_blank')} key={index} title={txnHash}>
						<div className="swap-toolbar-icon">⛓</div>
						Transaction {index + 1}
					</button>
				))
				}



			</div>

			{renderStatus()}
			{showProgress &&
				<div className="swap-progress-container">
					<ProgressBar percent={progress} />
				</div>
			}

			<div className="field-group token-select-group" style={{ flexGrow: 0, paddingTop: '10px', paddingBottom: '10px' }}>
				<div className="token-select radio-select">
					<label><input
						type="radio"
						name="baseAsset"
						value="thor.rune"
						onChange={() => handleBaseTokenSelect('thor.rune')}
						checked={baseAsset?.identifier.toLowerCase() === 'thor.rune'}
					/>
						RUNE</label>
					<label>
						<input
							type="radio"
							name="baseAsset"
							value="maya.cacao"
							onChange={() => handleBaseTokenSelect('maya.cacao')}
							checked={baseAsset?.identifier.toLowerCase() === 'maya.cacao'}
						/>
						CACAO</label>


					<select value={liquidityMode} onChange={e => setLiquidityMode(e.target.value)} disabled={swapInProgress}>
						<option value="sym">Symmetrical</option>
						<option value="asym">Asymmetrical</option>
					</select>
				</div>

				<div className="token-select">
					<button onClick={() => !swapInProgress && openTokenDialog(setAsset, 'asset')} className="select-button" style={{ minWidth: '130px', minHeight: '75px', paddingLeft: '15px' }}>
						{asset ? (
							<span className="token">
								<img src={asset.logoURI} alt={asset.name} style={{ width: '20px', height: '20px', marginRight: '5px' }} />
								<span><b>{asset.ticker}</b> {asset.name}</span>
							</span>
						) : (
							<span className="token">Select Asset...</span>
						)}
					</button>
				</div>
			</div>

			<div className="field-group amt-box" style={{ flexGrow: 0, paddingTop: '10px', paddingBottom: '10px' }}>
				<label>Base Asset Amount</label>
				<input type="number" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} disabled={swapInProgress} />
				<label>Asset Amount</label>
				<input type="number" value={assetAmount} onChange={e => setAssetAmount(e.target.value)} disabled={swapInProgress} />
			</div>
			<div>Remember to click calculate or your liquidity may be added wrong!</div>
			<div style={{ maxWidth: '100%', flexGrow: 1 }}>
				<DataTable
					data={positions}
					columns={columns}
					dense
					customStyles={customStyles}
					expandOnRowClicked
					expandableRows
					expandableRowsComponent={ExpandedComponent}
					height="100%"
					width="100%"
					responsive
					striped
					defaultSortFieldId={1}
				/>
			</div>

			<div className="infobox" style={{ textAlign: "right", borderStyle: 'inset' }}>Affiliate Fee 0.1%</div>

			{tokenChooserDialog}
		</div>
	);
};

export default PoolComponent;
