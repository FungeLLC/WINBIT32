// cryptoUtils.js
import CryptoJS from 'crypto-js';

export const decryptVault = (password, encryptedData) => {
  try {
    const encryptedBytes = CryptoJS.enc.Base64.parse(encryptedData);
    const key = CryptoJS.SHA256(password);
    const nonce = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(0, 3));
    const ciphertext = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(3));
    const decryptedBytes = CryptoJS.AES.decrypt({ ciphertext }, key, {
      mode: CryptoJS.mode.GCM,
      iv: nonce,
      padding: CryptoJS.pad.NoPadding,
    });
    const decryptedData = decryptedBytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
};

// Export other cryptographic utility functions as needed.
