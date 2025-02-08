import { RequestClient, ChainId } from "@swapkit/helpers";
import { formatBigIntToSafeValue } from "../../apps/winbit32/helpers/bigIntArithmetics";
import { ChainIdToChain } from "@swapkit/helpers";

// The type returned by Covalent v3
interface CovalentBalanceResponseV3 {
  data: {
    items: {
      token: {
        decimals: number;
        symbol: string;
        address: string;
        native: boolean;
      };
      balance: {
        current: string;
        last_24h: string;
        quote_rate: {
          current: number;
          last_24h: number;
        };
        quote: {
          current: number;
          last_24h: number;
        };
      };
      spam: boolean;
    }[];
  };
}

// Your “old”/legacy shape for each token balance
export interface LegacyBalance {
  value: number;    // numeric balance
  decimal: number;  // decimals
  chain: string;    // chain name
  ticker: string;   // token symbol
  address: string;  // contract address
  isNative: boolean;
}

// Helper function to convert Covalent v3 response item -> LegacyBalance
function convertToLegacy(item: CovalentBalanceResponseV3["data"]["items"][number], chainId: ChainId): LegacyBalance {
  const {
    token: { decimals, symbol, address, native },
    balance: { current },
  } = item;

  return {
    value: formatBigIntToSafeValue({
      value: BigInt(current),
      decimal: decimals,
      bigIntDecimal: decimals,
    }),
    decimal: decimals,
    chain: ChainIdToChain[chainId],
    ticker: symbol,
    address,
    isNative: native,
  };
}

export const covalentApi = ({ apiKey, chainId }: { apiKey: string; chainId: ChainId }) => ({
  getBalance: async (address: string): Promise<LegacyBalance[]> => {
    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    // Fetch v3 balances
    const { data } = await RequestClient.get<CovalentBalanceResponseV3>(
      `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v3/`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Filter spam items, then map them to legacy shape
    return (data?.items || [])
      .filter(({ spam }) => !spam)
      .map((item) => convertToLegacy(item, chainId));
  },
});

export type CovalentApiType = ReturnType<typeof covalentApi>;
