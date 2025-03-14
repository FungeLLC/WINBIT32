import { mnemonicToSeedSync } from "@scure/bip39";
import {
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
	createAssociatedTokenAccountInstruction,
	createTransferCheckedInstruction,
	getAccount,
	getAssociatedTokenAddress,
	getOrCreateAssociatedTokenAccount,
	getMint,
	getAssociatedTokenAddressSync,
	TokenAccountNotFoundError,
	TokenInvalidAccountOwnerError,
	TokenInvalidMintError,

} from "@solana/spl-token";
import { type TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	sendAndConfirmTransaction,
	ComputeBudgetProgram
} from "@solana/web3.js";
import {

	type SendOptions,
	type VersionedTransaction,
} from "@solana/web3.js";
import {
	AssetValue,
	Chain,
	ChainId,
	ChainToChainId,
	DerivationPath,
	RPCUrl,
	SwapKitError,
	SwapKitNumber,
	type WalletTxParams,
} from "@doritokit/helpers";
import { getPublicKey } from "ed25519-hd-key";
import { HDKey } from "micro-key-producer/slip10.js";
import bs58 from "bs58";
import { mnemonicToEntropy } from "bip39";
import { e, index } from "mathjs";
import { SOLToolbox as SOLToolboxDori } from "@doritokit/toolbox-solana";
import { Buffer } from 'buffer';
import * as web3 from "@solana/web3.js";

export function validateAddress(address: string) {
	try {
		const pubkey = new PublicKey(address);
		return true;//PublicKey.isOnCurve(pubkey.toBytes());
	} catch (_) {
		return false;
	}
}

export function getPublicKeyFromAddress(address: string) {
	try {
		return new PublicKey(address);
	} catch (_) {
		return null;
	}

}


export function createKeysForPath({
	phrase,
	derivationPath = DerivationPath.SOL,
}: {
	phrase: string;
	derivationPath?: string;
}) {

	//if phase is one word, assume it is a private key, we connect without derivation path
	if (phrase.split(' ').length === 1) {
		return Keypair.fromSecretKey(new Uint8Array(Buffer.from(phrase, 'hex')));
	}


	if (derivationPath === "bip39") {

		const seed = mnemonicToSeedSync(phrase, "");
		const keypair = Keypair.fromSeed(seed.slice(0, 32));
		return keypair;
	}
	// const seed = mnemonicToSeedSync(phrase);
	// console.log('sol seed',seed);
	// const hexSeed = mnemonicToEntropy(phrase);
	// const keyPair = Keypair.fromSeed(seed.slice(0, 32));
	// console.log('sol keypair',keyPair, keyPair.publicKey.toString(), hexSeed, seed);
	// return keyPair;

	// const bs58key = bs58.encode(seed);

	// return Keypair.fromSeed(bs58.decode(bs58key));

	const seed = mnemonicToSeedSync(phrase, "");

	const hdkey = HDKey.fromMasterSeed(seed);

	console.log('sol key', hdkey);


	const derived = hdkey.derive(derivationPath, true);
	return Keypair.fromSeed(derived.privateKey);


	// const seed = mnemonicToSeedSync(phrase);
	// const hdKey = HDKey.fromMasterSeed(seed);

	// return Keypair.fromSeed(hdKey.derive("m/44'/501'/0'/0", true).privateKey);
}


function getAddressFromKeys(keypair: Keypair) {
	return keypair.publicKey.toString();
}

declare type UnknownTokenInfo = {
	address: string,
	value: SwapKitNumber,
	decimal: number,
};

declare type TokenInfos = {
	[tokenAddress: string]: { tokenInfo: TokenInfo, dexTokenInfo: {}, timestamp: number },
};


async function getTokenInfos(tokens: UnknownTokenInfo[], tokenInfos: TokenInfos) {
	//https://api.dexscreener.com/latest/dex/tokens/{tokenAddresses} (max 30 a time comma separated)
	// const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/{tokenAddresses}', {
	// 	method: 'GET',
	// 	headers: {},
	// });
	// const data = await response.json();

	// 	//{
	// 	"schemaVersion": "text",
	// 		"pairs": [
	// 			{
	// 				"chainId": "text",
	// 				"dexId": "text",
	// 				"url": "https://example.com",
	// 				"pairAddress": "text",
	// 				"labels": [
	// 					"text"
	// 				],
	// 				"baseToken": {
	// 					"address": "text",
	// 					"name": "text",
	// 					"symbol": "text"
	// 				},
	// 				"quoteToken": {
	// 					"address": "text",
	// 					"name": "text",
	// 					"symbol": "text"
	// 				},
	// 				"priceNative": "text",
	// 				"priceUsd": "text",
	// 				"liquidity": {
	// 					"usd": 0,
	// 					"base": 0,
	// 					"quote": 0
	// 				},
	// 				"fdv": 0,
	// 				"marketCap": 0,
	// 				"info": {
	// 					"imageUrl": "https://example.com",
	// 					"websites": [
	// 						{
	// 							"url": "https://example.com"
	// 						}
	// 					],
	// 					"socials": [
	// 						{
	// 							"platform": "text",
	// 							"handle": "text"
	// 						}
	// 					]
	// 				},
	// 				"boosts": {}
	// 			}
	// 		]
	// }
	// eg.
	// {
	// 	"schemaVersion": "1.0.0",
	// 		"pairs": [
	// 			{
	// 				"chainId": "solana",
	// 				"dexId": "raydium",
	// 				"url": "https://dexscreener.com/solana/6y6abmtwu1uxacwynwwf7fha7nsha6krxhsejqu7vt88",
	// 				"pairAddress": "6Y6ABmtWu1uxacwyNwWf7fHA7nsHa6krXhseJqU7VT88",
	// 				"baseToken": {
	// 					"address": "PD11M8MB8qQUAiWzyEK4JwfS8rt7Set6av6a5JYpump",
	// 					"name": "AI Crystal Node",
	// 					"symbol": "AICRYNODE"
	// 				},
	// 				"quoteToken": {
	// 					"address": "So11111111111111111111111111111111111111112",
	// 					"name": "Wrapped SOL",
	// 					"symbol": "SOL"
	// 				},
	// 				"priceNative": "0.00001366",
	// 				"priceUsd": "0.002364",
	// 				"txns": {
	// 					"m5": {
	// 						"buys": 2,
	// 						"sells": 0
	// 					},
	// 					"h1": {
	// 						"buys": 17,
	// 						"sells": 31
	// 					},
	// 					"h6": {
	// 						"buys": 239,
	// 						"sells": 265
	// 					},
	// 					"h24": {
	// 						"buys": 1871,
	// 						"sells": 1774
	// 					}
	// 				},
	// 				"volume": {
	// 					"h24": 1373385.12,
	// 					"h6": 259053.13,
	// 					"h1": 31195.29,
	// 					"m5": 738.71
	// 				},
	// 				"priceChange": {
	// 					"m5": 0.94,
	// 					"h1": 7.89,
	// 					"h6": 25.74,
	// 					"h24": 45.09
	// 				},
	// 				"liquidity": {
	// 					"usd": 262150.24,
	// 					"base": 55362768,
	// 					"quote": 758.5987
	// 				},
	// 				"fdv": 2364595,
	// 				"marketCap": 2364595,
	// 				"pairCreatedAt": 1729150711000,
	// 				"info": {
	// 					"imageUrl": "https://dd.dexscreener.com/ds-data/tokens/solana/PD11M8MB8qQUAiWzyEK4JwfS8rt7Set6av6a5JYpump.png",
	// 					"websites": [],
	// 					"socials": [
	// 						{
	// 							"type": "twitter",
	// 							"url": "https://x.com/adkaspr"
	// 						},
	// 						{
	// 							"type": "telegram",
	// 							"url": "https://t.me/aicrynode"
	// 						}
	// 					]
	// 				}
	// 			},


	//split into 30s

	const tokenAddresses = tokens.map(token => token.address);
	for (let i = 0; i < tokenAddresses.length; i += 30) {
		const tokenAddressesChunk = tokenAddresses.slice(i, i + 30);
		const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/` + tokenAddressesChunk.join(","), {
			method: 'GET',
			headers: {},
		});
		const data = await response.json();
		if (!data.pairs || data.pairs.length === 0) {
			console.log('no pairs found for', tokenAddressesChunk);
			return;
		}
		//get "info" from each pair
		for (const pair of data.pairs) {
			//map pair info to TokenInfo type
			const tokenInfo: TokenInfo = {
				chainId: 101,
				address: pair.baseToken.address,
				name: pair.baseToken.name,
				symbol: pair.baseToken.symbol,
				decimals: tokens.find(token => token.address === pair.baseToken.address)?.decimal || 0,
				logoURI: pair.info?.imageUrl,
				extensions: {
					website: pair.info?.websites[0]?.url,
					twitter: pair.info?.socials?.find(social => social.platform === "twitter")?.handle,
					github: pair.info?.socials?.find(social => social.platform === "github")?.handle,
					medium: pair.info?.socials?.find(social => social.platform === "medium")?.handle,
					tgann: pair.info?.socials?.find(social => social.platform === "tgann")?.handle,
					tggroup: pair.info?.socials?.find(social => social.platform === "tggroup")?.handle,
					discord: pair.info?.socials?.find(social => social.platform === "discord")?.handle,
					imageUrl: pair.info?.imageUrl,
					description: pair.info?.description,
				},
			};

			tokenInfos[pair.baseToken.address] = { tokenInfo, dexTokenInfo: pair, timestamp: Date.now() };
		}
	}

	console.log('tokenInfos', tokenInfos);

}

async function getTokenBalances({
	connection,
	address,
	tokenInfos,
}: {
	connection: Connection;
	address: string;
	tokenInfos: {};
}) {
	const tokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(address), {
		programId: TOKEN_PROGRAM_ID,
	});
	console.log('tokenAccounts', tokenAccounts);
	const tokenListProvider = new TokenListProvider();
	const tokenListContainer = await tokenListProvider.resolve();
	const tokenList = tokenListContainer.filterByChainId(101).getList();

	const tokenBalances: AssetValue[] = [];

	const unknownTokens: UnknownTokenInfo[] = [];

	for await (const tokenAccountInfo of tokenAccounts.value) {
		const accountInfo = tokenAccountInfo.account.data.parsed.info;
		const tokenAmount = accountInfo.tokenAmount.uiAmount;
		const mintAddress = accountInfo.mint;
		const decimal = accountInfo.tokenAmount.decimals;
		if (tokenAmount > BigInt(0)) {

			// Find the token info from the token list
			let tokenInfo = tokenList.find((token: TokenInfo) => token.address === mintAddress);

			//look in tokenInfos
			if (!tokenInfo && tokenInfos[mintAddress]) {
				tokenInfo = tokenInfos[mintAddress];
			}
			const tokenSymbol = tokenInfo ? tokenInfo.symbol : "UNKNOWN";


			if (!tokenInfo) {
				unknownTokens.push({ address: mintAddress, value: SwapKitNumber.fromBigInt(accountInfo.tokenAmount.amount, decimal), decimal });
			} else {



				tokenBalances.push(
					new AssetValue({
						value: SwapKitNumber.fromBigInt(accountInfo.tokenAmount.amount, decimal),
						decimal,
						identifier: `${Chain.Solana}.${tokenSymbol}-${mintAddress.toString()}`,
					}),
				);
			}

		}
	}
	if (unknownTokens.length !== 0) {
		console.log('unknownTokens', unknownTokens);

		//loop through unknown tokens and get from dexscreener
		await getTokenInfos(unknownTokens, tokenInfos);

		// Add the token info to the token balances
		for (const unknownToken of unknownTokens) {
			const tokenInfo = tokenInfos[unknownToken.address];
			const tokenSymbol = tokenInfo ? tokenInfo.tokenInfo.symbol : "UNKNOWN";

			console.log('unknown token', unknownToken.address, tokenSymbol, tokenInfo);

			tokenBalances.push(
				new AssetValue({
					value: unknownToken.value,
					decimal: unknownToken.decimal,
					identifier: `${Chain.Solana}.${tokenSymbol}-${unknownToken.address}`,
				}),
			);
		}

	}

	return tokenBalances;
}

function getBalance(connection: Connection, tokenInfos: {}) {
	return async (address: string) => {
		const SOLBalance = await connection.getBalance(new PublicKey(address));
		const tokenBalances = await getTokenBalances({ connection, address, tokenInfos });

		return [AssetValue.from({ chain: Chain.Solana, value: BigInt(SOLBalance) }), ...tokenBalances];
	};
}


async function getOrCreateAssociatedTokenAccountTx(transaction: Transaction, connection: Connection, owner: PublicKey, mint: PublicKey, from: PublicKey, allowOwnerOffCurve = false,
	commitment?: Commitment,
	confirmOptions?: ConfirmOptions,
	programId = TOKEN_PROGRAM_ID,
	associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,) {

	const associatedToken = getAssociatedTokenAddressSync(
		mint,
		owner,
		allowOwnerOffCurve,
		programId,
		associatedTokenProgramId,
	);

	// This is the optimal logic, considering TX fee, client-side computation, RPC roundtrips and guaranteed idempotent.
	// Sadly we can't do this atomically.
	let account: Account;
	try {
		account = await getAccount(connection, associatedToken, commitment, programId);
	} catch (error: unknown) {
		// TokenAccountNotFoundError can be possible if the associated address has already received some lamports,
		// becoming a system account. Assuming program derived addressing is safe, this is the only case for the
		// TokenInvalidAccountOwnerError in this code path.
		if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
			// As this isn't atomic, it's possible others can create associated accounts meanwhile.

			console.log('associatedToken', associatedToken, owner, mint, programId, associatedTokenProgramId, error);

			try {
				transaction.add(
					createAssociatedTokenAccountInstruction(
						from,
						associatedToken,
						owner,
						mint,
						programId,
						associatedTokenProgramId,
					),
				);
				//get receivers associated token account address
				account = { address: associatedToken };

				return account;

			} catch (error: unknown) {

				console.log('error', error);

				// Ignore all errors; for now there is no API-compatible way to selectively ignore the expected
				// instruction error if the associated account exists already.
			}

			// Now this should always succeed
			account = await getAccount(connection, associatedToken, commitment, programId);
		} else {
			throw error;
		}
	}

	if (!account.mint.equals(mint)) throw new TokenInvalidMintError();
	if (!account.owner.equals(owner)) throw new TokenInvalidOwnerError();

	return account;

}


export async function createSolanaTokenTransaction({
	tokenAddress,
	recipient,
	from,
	connection,
	amount,
	decimals,
}: {
	tokenAddress: string;
	recipient: string;
	from: PublicKey;
	connection: Connection;
	amount: number;
	decimals: number;
}) {
	const transaction = new Transaction();
	const tokenPublicKey = new PublicKey(tokenAddress);
	const signer = from;
	const mint = await getMint(connection, tokenPublicKey);
	const mintPublicKey = new PublicKey(mint.address);
	console.log('mint', mint, connection, tokenPublicKey, mintPublicKey, from, recipient, amount, decimals);
	const fromSPLAccount = await getOrCreateAssociatedTokenAccount(connection, from, mintPublicKey, from);
	console.log('fromSPLAccount', fromSPLAccount);
	// const fromSPLAccountPublicKey = new PublicKey(fromSPLAccount.address);
	const recipientPublicKey = new PublicKey(recipient);
	const recipientSPLAccount = await getOrCreateAssociatedTokenAccountTx(transaction, connection, recipientPublicKey, mintPublicKey, from, true);
	const recipientSPLAddress = recipientSPLAccount.address;

	console.log('createSolanaTokenTransaction',
		
		fromSPLAccount.address,
		fromSPLAccount.address.toBase58(),
		mintPublicKey,
		mintPublicKey.toBase58(),
		recipientSPLAddress,
		recipientSPLAddress.toBase58(),
		signer,
		signer.toBase58(),
		Number(amount),
		Number(decimals),

	);

	try {
		// await getAccount(connection, recipientSPLAddress);
		return transaction.add(
			createTransferCheckedInstruction(
				fromSPLAccount.address,
				mintPublicKey,
				recipientSPLAddress,
				signer,
				Number(amount),
				Number(decimals),
			)
		);
	} catch (error: unknown) {

		console.log('error', error);

		return transaction;
	}
}


export async function getTransferTransaction(connection: Connection, recipient: string, assetValue: AssetValue, fromPublicKey: PublicKey) {

	const transaction = new Transaction();
	const recipientPublicKey = new PublicKey(recipient);

	//get recent priority fees and set optimal
	const feeResult = await connection.getRecentPrioritizationFees() || [
		{
			prioritizationFee: 0,
			slot: 0,
		},

	];

	console.log('feeResult', feeResult);

	//result is  [        {
        //     "prioritizationFee": 0,
        //     "slot": 300234934
        // }, ...]
	//go thru result, sort by slot find the highest 10 "slot" and then average the "prioritizationFee"
	const prioritizationFee = feeResult
		.sort((a, b) => b.slot - a.slot)
		.slice(0, 10)
		.reduce((acc, curr) => acc + curr.prioritizationFee, 0) / 10;

	// request a specific compute unit budget
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
		units: 1000000,
	});

	// set the desired priority fee
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
		microLamports: prioritizationFee + 10
	});

	// add the instructions to the transaction
	transaction.add(modifyComputeUnits);
	transaction.add(addPriorityFee);


	if (assetValue.isGasAsset) {

		transaction.add(
			SystemProgram.transfer({
				fromPubkey: fromPublicKey,
				lamports: assetValue.getValue("bigint"),
				toPubkey: new PublicKey(recipient),
			}),
		);
		// }
	} else if (assetValue.address) {
		const solTx = await createSolanaTokenTransaction({
			amount: assetValue.getBaseValue("number"),
			connection,
			decimals: assetValue.decimal as number,
			from: fromPublicKey,
			recipient,
			tokenAddress: assetValue.address,
		});
		transaction.add(solTx);
	} else {
		transaction = undefined;
	}


	if (!transaction) {
		throw new SwapKitError("core_transaction_invalid_sender_address");
	}

	console.log('transaction', transaction, fromPublicKey, recipient, assetValue);


	const blockHash = await connection.getLatestBlockhash('confirmed');
	transaction.recentBlockhash = blockHash.blockhash;
	transaction.feePayer = fromPublicKey;



	return transaction;

}



function transfer(connection: Connection) {
	return async ({
		recipient,
		assetValue,
		fromKeypair,
		isProgramDerivedAddress
	}: WalletTxParams & {
		assetValue: AssetValue;
		fromKeypair: Keypair;
		isProgramDerivedAddress?: boolean;
	}) => {

		if (!(isProgramDerivedAddress || validateAddress(recipient))) {
			throw new SwapKitError("core_transaction_invalid_recipient_address");
		}



		const transaction = await getTransferTransaction(connection, recipient, assetValue, fromKeypair.publicKey);

		return sendAndConfirmTransaction(connection, transaction, [fromKeypair]);

	}

}



function signTransaction(transaction: Transaction, fromKeypair: Keypair) {
	transaction.feePayer = fromKeypair.publicKey;
	return transaction.sign(fromKeypair);
}

function signAllTransactions(transactions: Transaction[], fromKeypair: Keypair) {
	return transactions.map((transaction) => signTransaction(transaction, fromKeypair));
}


function signAndSendTransaction(connection: Connection, fromKeypair: Keypair) {
	return async(transaction: VersionedTransaction, opts?: SendOptions & { fromKeypair: Keypair }) => {
		console.log('signAndSendTransaction', transaction, opts, fromKeypair);
		if (!opts?.fromKeypair && !fromKeypair) {
			throw new SwapKitError("core_wallet_not_keypair_wallet");
		}
		const keypairToUse = opts?.fromKeypair || fromKeypair;
		
		// Both regular Transaction and VersionedTransaction have a sign method
		// that takes an array of signers
		if (typeof transaction.sign !== 'function') {
			transaction = new web3.VersionedTransaction(transaction.message);
			console.log('transaction is a VersionedTransaction', transaction);
		}
		
		transaction.sign([keypairToUse]);

		console.log('signed transaction', transaction);

		opts.fromKeypair = keypairToUse;

		// Execute the transaction
		const latestBlockHash = await connection.getLatestBlockhash();
		const rawTransaction = transaction.serialize();
		const txid = await connection.sendRawTransaction(rawTransaction, {
			skipPreflight: true,
			maxRetries: 2
		});
		await connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: txid
		});

		return txid;


	};
}

function broadcastTransaction(connection: Connection) {
	return (transaction: Transaction) => {
		return connection.sendRawTransaction(transaction.serialize());
	};
}


export const SOLToolbox = ({ rpcUrl = RPCUrl.Solana, fromKeypair }: { rpcUrl?: string, fromKeypair?: Keypair } = {}) => {


	const doriToolbox = SOLToolboxDori({ rpcUrl });
	const connection = doriToolbox.connection;
	const tokenInfos: TokenInfos = {};

	return {
		...doriToolbox,
		signAndSendTransaction: signAndSendTransaction(connection, fromKeypair),
		createKeysForPath,
		getAddressFromKeys,
		getBalance: getBalance(connection, tokenInfos),
		transfer: transfer(connection),
		validateAddress,
		signTransaction,
		signAllTransactions,
	};
};