import { wordlists } from "bip39";
import { createHash } from "crypto-browserify";

export function phraseToParts(phrase) {
	const parts = phrase.trim().split(/\s+/g);
	//if last part is a number
	const index = !isNaN(parts[parts.length - 1]) ? parts.pop() : 0;
	const words = parts.join(' ');

	return { words, index };
}


export function isValidMnemonic(mnemonic) {
	// Split the mnemonic into individual words
	const words = mnemonic.trim().split(/\s+/g);
	// Ensure the mnemonic has exactly 12, 15, 18, 21, or 24 words
	if (![12, 15, 18, 21, 24].includes(words.length)) {
		return false;
	}

	// Convert words back to the original entropy+checksum bits
	const bits = words.map((word) => {
		const index = wordlists.english.indexOf(word);
		if (index === -1) {
			return null; // word not found in the list
		}
		return index.toString(2).padStart(11, "0"); // convert word index to 11-bit binary
	});

	// If any word was invalid, return false
	if (bits.includes(null)) {
		return false;
	}

	// Concatenate all bits into a single string
	const bitString = bits.join("");
	// Separate the entropy and checksum
	const entropyBits = bitString.slice(0, -words.length / 3);
	const checksumBits = bitString.slice(-words.length / 3);

	// Calculate checksum of the entropy
	const entropyBytes = Buffer.from(
		entropyBits.match(/.{1,8}/g).map((byte) => parseInt(byte, 2))
	);
	const hash = createHash("sha256").update(entropyBytes).digest();
	const hashBits = hash
		.toString("binary")
		.split("")
		.map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
		.join("");

	// Check if calculated checksum matches the original
	const calculatedChecksum = hashBits.slice(0, words.length / 3);

	return checksumBits === calculatedChecksum;
}
