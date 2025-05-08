import type { QuoteResponseRoute } from "@doritokit/api";
import {
  Chain,
  ProviderName,
  SwapKitError,
  type SwapKitPluginParams,
  type SwapParams,
} from "@doritokit/helpers";
import { VersionedTransaction } from "@solana/web3.js";

function plugin({ getWallet }: SwapKitPluginParams) {
  async function swap({ route }: SwapParams<"jupiter", QuoteResponseRoute>) {
    if (!route?.tx) throw new SwapKitError("core_swap_invalid_params");

    const wallet = getWallet(Chain.Solana);
    if (!wallet) {
      throw new SwapKitError("core_wallet_connection_not_found");
    }

    try {
      console.log('route.tx', route.tx);
      const swapTransactionBuf = Buffer.from(route.tx as string, "base64");
      console.log('swapTransactionBuf', swapTransactionBuf);
      const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));
      console.log('transaction', transaction);
      
      const signature = await wallet.signAndSendTransaction(transaction);

      return signature;
    } catch (error) {
      throw new SwapKitError("core_swap_transaction_error", error);
    }
  }

  return {
    swap,
    supportedSwapkitProviders: [ProviderName.JUPITER],
  };
}

export const JupiterPlugin = { jupiter: { plugin } } as const;
