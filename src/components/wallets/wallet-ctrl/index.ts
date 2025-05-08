import type { Keplr } from "@keplr-wallet/types";
import type { Eip1193Provider } from "@swapkit/toolbox-evm";
import type { SolanaProvider } from "@swapkit/toolbox-solana";
import { ChainToRPC, type EVMChain } from "@swapkit/helpers";
import { JsonRpcProvider } from "ethers";

export { ctrlWallet, CTRL_SUPPORTED_CHAINS } from "./ctrlWallet";

type XdefiSolana = SolanaProvider & { isXDEFI: boolean };



export const getProvider = (chain: EVMChain, customUrl?: string) => {
  return new JsonRpcProvider(customUrl || ChainToRPC[chain]);
};



declare global {
  interface Window {
    ctrl?: {
      binance: Eip1193Provider;
      bitcoin: Eip1193Provider;
      bitcoincash: Eip1193Provider;
      dogecoin: Eip1193Provider;
      ethereum: Eip1193Provider;
      keplr: Keplr;
      litecoin: Eip1193Provider;
      thorchain: Eip1193Provider;
      mayachain: Eip1193Provider;
      solana: XdefiSolana;
    };
  }
}
