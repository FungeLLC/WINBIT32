import { type DepositAddressRequest, SwapSDK } from "@chainflip/sdk/swap";
import {
  AssetValue,
  type EVMWallets,
  ProviderName,
  type SolanaWallets,
  type SubstrateWallets,
  SwapKitError,
  type SwapKitPluginParams,
  type UTXOWallets,
} from "@swapkit/helpers";
import { assetTickerToChainflipAsset, chainToChainflipChain } from "./broker";
import type { RequestSwapDepositAddressParams } from "./types";
import { min } from "lodash";
import { format } from "mathjs";
import { ChainflipPlugin as DoritokitChainflipPlugin } from "@doritokit/plugin-chainflip";

type SupportedChain = keyof (EVMWallets & SubstrateWallets & UTXOWallets & SolanaWallets);

export async function getDepositAddress({
  buyAsset,
  sellAsset,
  recipient,
  brokerEndpoint,
  maxBoostFeeBps,
  brokerCommissionBPS,
  ccmParams,
  chainflipSDKBroker,
  slippage,
  numChunks,
  chunkIntervalBlocks,
  affiliateBrokers,
  sender,
  route
}: {
  buyAsset: AssetValue;
  sellAsset: AssetValue;
  recipient: string;
  brokerEndpoint: string;
  maxBoostFeeBps: number;
  brokerCommissionBPS?: number;
  ccmParams?: DepositAddressRequest["ccmParams"];
  chainflipSDKBroker?: boolean;
  slippage?: number;
  numChunks?: number;
  chunkIntervalBlocks?: number;
  affiliateBrokers?: string[];
  sender: string;
  route?: any;
}) {
  try {
    if (chainflipSDKBroker) {
      const chainflipSDK = new SwapSDK({
        broker: { url: brokerEndpoint, commissionBps: brokerCommissionBPS || 0 },
        network: "mainnet",
      });

      const srcAsset = assetTickerToChainflipAsset.get(sellAsset.ticker);
      const srcChain = chainToChainflipChain.get(sellAsset.chain);
      const destAsset = assetTickerToChainflipAsset.get(buyAsset.ticker);
      const destChain = chainToChainflipChain.get(buyAsset.chain);

      if (!(srcAsset && srcChain && destAsset && destChain)) {
        throw new SwapKitError("chainflip_unknown_asset", { sellAsset, buyAsset });
      }

      const isV2 = route.cfQuote? true : false;

      //     fillOrKillParams: {
      //       slippageTolerancePercent: 1, // 1% slippage tolerance from quoted price
      //         refundAddress: 'tb1p8p3xsgaeltylmvyrskt3mup5x7lznyrh7vu2jvvk7mn8mhm6clksl5k0sm', // address to which assets are refunded
      //           retryDurationBlocks: 100, // 100 blocks * 6 seconds = 10 minutes before deposits are refunded
      // },
      //rate is the number of buyAsset units per sellAsset unit - not bigints... so adjust for the number of decimals
      const rate = sellAsset.getValue("number") / buyAsset.getValue("number");


      const dcaParams = {
        numberOfChunks: numChunks || 1,
        chunkIntervalBlocks: chunkIntervalBlocks || 0,

      } as typeof dcaParams;

      // affiliateBrokers: [
      //   {
      //     account: 'cFJ1WW9QSvfzMoJJ4aNtGT8WJPtmEuxByc1kV37DTBkzA9S1W',
      //     commissionBps: 100,
      //   },
      // ],

      const _affiliateBrokers = affiliateBrokers?.map((broker) => {
        return {
          account: broker,
          commissionBps: Math.floor(100 / affiliateBrokers.length)
        };
      });

      console.log("dcaParams", dcaParams, brokerCommissionBPS, maxBoostFeeBps, recipient, sellAsset.getBaseValue("string"), srcAsset, srcChain, destAsset, destChain, _affiliateBrokers, sellAsset.getValue("number"), buyAsset.getValue("number"));

      const fillOrKillParams = {
        slippageTolerancePercent: slippage || 1, //only in V2
        refundAddress: sender,
        retryDurationBlocks: 100,
        //as non-scientific notation string
      } as typeof fillOrKillParams;

      let resp;

      if(isV2){
        fillOrKillParams.slippageTolerancePercent = slippage || 1;

        const req = {
          quote: route.cfQuote,
          destAddress: recipient,
          brokerCommissionBPS: brokerCommissionBPS || 0,
          fillOrKillParams,
          dcaParams,
          affiliateBrokers: _affiliateBrokers,
        };

        console.log(req);

        resp = await chainflipSDK.requestDepositAddressV2(req);

      }else{
        fillOrKillParams.minPrice = format(rate, { notation: 'fixed' });

        const req = {
          destAddress: recipient,
          srcAsset,
          srcChain,
          destAsset,
          destChain,
          maxBoostFeeBps,
          amount: sellAsset.getBaseValue("string"),
          brokerCommissionBps: brokerCommissionBPS || 0,
          ccmParams,
          fillOrKillParams,
          dcaParams,
        };
        console.log(req);
      
        resp = await chainflipSDK.requestDepositAddress(req);
      
      }
      
        return {
        channelId: resp.depositChannelId,
        depositAddress: resp.depositAddress,
        chain: buyAsset.chain,
      };
    }

    const response = await fetch(brokerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyAsset: buyAsset.toString(),
        sellAsset: sellAsset.toString(),
        destinationAddress: recipient,
        maxBoostFeeBps,
      }),
    }).then((res) => res.json());

    if (chainflipSDKBroker && "error" in response.data) {
      throw new Error(`RPC error [${response.data.error.code}]: ${response.data.error.message}`);
    }

    return response as {
      channelId: string;
      depositAddress: string;
      chain: string;
    };
  } catch (error) {
    throw new SwapKitError("chainflip_channel_error", error);
  }
}

function plugin({
  getWallet,
  config: { chainflipBrokerUrl: legacyChainflipBrokerUrl, chainflipBrokerConfig },
}: SwapKitPluginParams<{
  chainflipBrokerUrl?: string;
  chainflipBrokerConfig?: { chainflipBrokerUrl: string; useChainflipSDKBroker?: boolean };
}>) {

  const doritokitChainflipPlugin = new DoritokitChainflipPlugin.chainflip.plugin({
    getWallet,
    config: { chainflipBrokerUrl: legacyChainflipBrokerUrl, chainflipBrokerConfig },
  });

  async function swap(swapParams: RequestSwapDepositAddressParams, dexAggregatorPlugin?: {
    plugin: (params: SwapKitPluginParams<any>) => any;
    config?: any;
  }) {
    return doritokitChainflipPlugin.swap(swapParams, dexAggregatorPlugin);
  }


  async function winbit32Swap(swapParams: RequestSwapDepositAddressParams) {
    const { chainflipBrokerUrl, useChainflipSDKBroker } = chainflipBrokerConfig || {};

    const brokerUrl = chainflipBrokerUrl || legacyChainflipBrokerUrl;

    // if (!(swapParams?.route?.buyAsset && brokerUrl)) {
    //   throw new SwapKitError("core_swap_invalid_params", {
    //     ...swapParams,
    //     chainflipBrokerUrl: brokerUrl,
    //   });
    // }
    // const {
    //   route: {
    //     buyAsset: buyAssetString,
    //     sellAsset: sellAssetString,
    //     sellAmount,
    //     destinationAddress: recipient,
    //   },
    //   maxBoostFeeBps = 0,
    // } = swapParams;

    // if (!(sellAssetString && buyAssetString)) {
    //   throw new SwapKitError("core_swap_asset_not_recognized");
    // }

    // const sellAsset = await AssetValue.from({
    //   asyncTokenLookup: true,
    //   asset: sellAssetString,
    //   value: sellAmount,
    // });

    // const wallet = getWallet(sellAsset.chain as SupportedChain);

    // if (!wallet) {
    //   throw new SwapKitError("core_wallet_connection_not_found");
    // }

    // const buyAsset = await AssetValue.from({ asyncTokenLookup: true, asset: buyAssetString });

    //   const { depositAddress } = await getDepositAddress({
    //     brokerEndpoint: brokerUrl,
    //     buyAsset,
    //     recipient,
    //     sellAsset,
    //     maxBoostFeeBps,
    //     chainflipSDKBroker: useChainflipSDKBroker,
    //   });

    //   const tx = await wallet.transfer({
    //     assetValue: sellAsset,
    //     from: wallet.address,
    //     recipient: depositAddress,
    //     isProgramDerivedAddress: true,
    //   });

    //   return tx as string;
  }

  return {
    swap,
    getDepositAddress,
    supportedSwapkitProviders: [ProviderName.CHAINFLIP],
  };
}

export const ChainflipPlugin = { chainflip: { plugin } } as const;

/**
 * @deprecated Use import { ChainflipPlugin } from "@swapkit/plugin-chainflip" instead
 */
export const ChainflipProvider = ChainflipPlugin;
