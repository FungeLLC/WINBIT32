import {
	RadixEngineToolkit,
	PrivateKey,
	NetworkId,

} from "@radixdlt/radix-engine-toolkit";
import { TransactionBuilder, generateRandomNonce, ManifestBuilder, decimal, address as addressType, bucket, str, enumeration } from '@radixdlt/radix-engine-toolkit';
import bigInt from 'big-integer';
import { mayaRadixRouter } from '../apps/winbit32/helpers/maya.js';

export const wbRadixToolbox = async({ api, signer }) => {
	const { getRadixCoreApiClient, RadixToolbox, createPrivateKey, RadixMainnet } = await import("../wallets/secureKeystore/legacyRadix.ts");

	let address: string;
	let toolbox: any;
	let sensitiveMethods: string[] = [];

	toolbox = await RadixToolbox({ api, signer });

	toolbox.address = await RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
		signer.publicKey(),
		NetworkId.Mainnet
	);


	toolbox.transfer = async function ({ assetValue, from, recipient, memo, toRouter = true }) {

		const assetBigInt = bigInt(assetValue.bigIntValue / 1000000000000000000n);
		const assetNumber = assetBigInt.toJSNumber();
		const constructionMetadata = await api.LTS.getConstructionMetadata();

		const transactionHeader = {
			networkId: 1,
			validFromEpoch: Number(constructionMetadata.current_epoch),
			startEpochInclusive: Number(constructionMetadata.current_epoch),
			endEpochExclusive: Number(constructionMetadata.current_epoch) + 100,
			nonce: await generateRandomNonce(),
			fromAccount: from,
			signerPublicKey: signer.publicKey(),
			notaryPublicKey: signer.publicKey(),
			notaryIsSignatory: true,
			tipPercentage: 0
		};

		console.log('transactionHeader', transactionHeader);
		console.log('assetValue', assetValue);
		if(toRouter && !memo.includes(':be:')) {
			memo = memo + ':be:10';
		}

		const mayaRouter = await mayaRadixRouter();


		console.log('assetBigInt', assetBigInt, decimal(assetNumber.toString()), assetNumber, addressType(from), addressType(recipient), memo);


		const transactionManifest = new ManifestBuilder()
			.callMethod(from, "lock_fee", [
				decimal(2),
			])
			.callMethod(from, "withdraw", [
				addressType(assetValue.address),
				decimal(assetNumber.toString()),
			])
			.takeAllFromWorktop(
				assetValue.address,
				(builder, bucketId) => {
					console.log('bucketId', bucketId, bucket(bucketId), mayaRouter);
					if (toRouter) {
						return builder
							.callMethod(mayaRouter, "user_deposit", [
								addressType(from),
								addressType(recipient),
								bucket(bucketId),
								str(memo)

							])
					} else {


						return builder
							.callMethod(recipient, "try_deposit_or_abort", [
								bucket(bucketId),
								enumeration(0)
							])

					}


				}
			)

			.build();
		console.log('transactionHeader', transactionHeader);
		console.log('transactionManifest', transactionManifest);


		const transaction = await TransactionBuilder.new()
			.then(builder =>
				builder
					.header(transactionHeader)
					.plainTextMessage(memo || '') // Add the memo
					.manifest(transactionManifest)
					.sign(signer) // Sign the transaction
					.notarize(signer) // Notarize the transaction
			);

		console.log('transaction', transaction);

		const transactionId = await RadixEngineToolkit.NotarizedTransaction.intentHash(transaction);

		const compiledNotarizedTransaction =
			await RadixEngineToolkit.NotarizedTransaction.compile(transaction);

		console.log('transactionId', transactionId, compiledNotarizedTransaction);


		await api.LTS.submitTransaction({
			notarized_transaction_hex: Buffer.from(compiledNotarizedTransaction).toString('hex'),
		});
		return transactionId;
	};
	toolbox.transferToAddress = ({ ...args }) => {
		return toolbox.transfer({ ...args, toRouter: false });
	}

	return toolbox;

}

export default wbRadixToolbox;