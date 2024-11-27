import { ethers } from "ethers";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import bs58  from "bs58";
import { bitcoin } from "bitcoinjs-lib";
import { Keyring } from "@polkadot/keyring";

// Group by key type
const NETWORKS = {
	secp256k1: ["ETH", "BTC", "RUNE", "MAYA", "FLIP"],
	ed25519: ["SOL", "XRD"],
	sr25519: ["DOT"],
};

function validateSecp256k1Key(key, network) {
	try {
		const cleanKey = key.replace("0x", "");
		const keyBuffer = Buffer.from(cleanKey, "hex");

		// Only attempt mnemonic derivation for 16/32 byte keys (potential seeds)
		// 64 byte keys are likely account private keys
		if ([16, 32].includes(keyBuffer.length)) {
			try {
				const entropy = new Uint8Array(keyBuffer);
				const phrase = entropyToMnemonic(entropy, wordlist);
				const mnemonicWallet = ethers.Wallet.fromMnemonic(phrase);
				const directWallet = new ethers.Wallet(key);

				// If addresses match, this key can be used as HD seed
				if (directWallet.address === mnemonicWallet.address) {
					return {
						isValid: true,
						network,
						phrase,
						address: directWallet.address,
						isHDKey: true,
					};
				}
			} catch (e) {}
		}

		// If mnemonic derivation fails or key is 64 bytes, treat as direct account key
		const wallet = new ethers.Wallet(key);
		return {
			isValid: true,
			network,
			phrase: `PK secp256k1:${key}`,
			address: wallet.address,
			isHDKey: false,
		};
	} catch (e) {
		return { isValid: false };
	}
}
function validateEd25519Key(key, network) {
	try {
		// Ed25519 keys are always 64 bytes (32 private + 32 public)
		// No HD wallet possibility - always direct account keys
		const decoded = bs58.decode(key);
		if (decoded.length !== 64) return { isValid: false };

		return {
			isValid: true,
			network,
			phrase: `PK ed25519:${key}`,
			address: bs58.encode(decoded.slice(32)),
			isHDKey: false, // Always false for ed25519
		};
	} catch (e) {
		return { isValid: false };
	}
}

function validateSr25519Key(key, network) {
	try {
		// Sr25519 uses substrate derivation - always treats input as path
		// No distinction needed between seed and account keys
		const keyring = new Keyring({ type: "sr25519" });
		const pair = keyring.addFromUri(key);

		return {
			isValid: true,
			network,
			phrase: `PK sr25519:${key}`,
			address: pair.address,
			isHDKey: false, // Always false for direct keys
		};
	} catch (e) {
		return { isValid: false };
	}
}

export function decodePrivateKey(key) {
	// Try each key type
	for (const [keyType, networks] of Object.entries(NETWORKS)) {
		for (const network of networks) {
			let result;

			switch (keyType) {
				case "secp256k1":
					result = validateSecp256k1Key(key, network);
					break;
				case "ed25519":
					result = validateEd25519Key(key, network);
					break;
				case "sr25519":
					result = validateSr25519Key(key, network);
					break;
			}

			if (result.isValid) {
				return {
					...result,
					chkPrivateKeyBuffer: Buffer.from(key.replace("0x", ""), "hex"),
				};
			}
		}
	}

	return { isValid: false, phrase: "", network: null };
}
