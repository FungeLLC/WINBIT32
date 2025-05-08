// protobuf/vault_pb.js
import {
	create,
	toBinary,
	fromBinary,
	fromJson,
	fromJsonString,
	timestamp,
	equals,
} from "@bufbuild/protobuf";
import { WireType } from "@bufbuild/protobuf/wire";

export function isMessage(arg, schema) {
	const isMessage =
		arg !== null &&
		typeof arg == "object" &&
		"$typeName" in arg &&
		typeof arg.$typeName == "string";
	if (!isMessage) {
		return false;
	}
	if (schema === undefined) {
		return true;
	}
	return schema.typeName === arg.$typeName;
}

// Vault_KeyShare message definition
export class Vault_KeyShare {
	constructor(data = {}) {
		this.public_key = data.public_key || "";
		this.keyshare = data.keyshare || "";
		this.file = data.file || { edition: "proto3", version: 0 };
		this.$typeName = "vultisig.vault.v1.Vault.KeyShare";
	}

	static fromBinary(bytes, options) {
		const instance = new Vault_KeyShare();
		fromBinary(instance, bytes, options);
		return instance;
	}

	static fromJson(jsonValue, options) {
		return fromJson(Vault_KeyShare, jsonValue, options);
	}

	static fromJsonString(jsonString, options) {
		return fromJsonString(Vault_KeyShare, jsonString, options);
	}

	static equals(a, b) {
		return equals(Vault_KeyShare, a, b);
	}
}

// Vault message definition
export class Vault {
	constructor(data = {}) {
		this.name = data.name || "";
		this.public_key_ecdsa = data.public_key_ecdsa || "";
		this.public_key_eddsa = data.public_key_eddsa || "";
		this.signers = data.signers || [];
		this.created_at = data.created_at || null;
		this.hex_chain_code = data.hex_chain_code || "";
		this.key_shares = (data.key_shares || []).map(
			(keyShare) => new Vault_KeyShare(keyShare)
		);
		this.local_party_id = data.local_party_id || "";
		this.reshare_prefix = data.reshare_prefix || "";
		this.file = data.file || { edition: "proto3", version: 0 };
		this.$typeName = "vultisig.vault.v1.Vault";
		this.fields = data.fields || Vault.getFields();
		this.members = data.members || Vault.getMembers();
	}

	static getFields() {
		return [
			{ no: 1, name: "name", kind: "scalar", T: 9 /* ScalarType.STRING */,
				WireType: 0
			},
			{
				no: 2,
				name: "public_key_ecdsa",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
				WireType: 2
			},
			{
				no: 3,
				name: "public_key_eddsa",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
			},
			{
				no: 4,
				name: "signers",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
				repeated: true,
			},
			{ no: 5, name: "created_at", kind: "message", T: 8 /* ScalarType.TIMESTAMP */ },
			{
				no: 6,
				name: "hex_chain_code",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
			},
			{
				no: 7,
				name: "key_shares",
				kind: "message",
				T: Vault_KeyShare,
				repeated: true,
			},
			{
				no: 8,
				name: "local_party_id",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
			},
			{
				no: 9,
				name: "reshare_prefix",
				kind: "scalar",
				T: 9 /* ScalarType.STRING */,
			},
		];
	}

	static getMembers() {
		return Vault.getFields().map((field) => ({
			...field,
			fieldKind: field.kind,
			getDefaultValue: () => {
				if (field.repeated) {
					return [];
				}
				if (field.kind === "scalar") {
					return null;
				}
				if (field.kind === "message") {
					return new field.T();
				}
			},
			kind: "field",
			enum: {
				values: [{ number: field.no }],
			},
		}));
	}

	static fromBinary(bytes, options) {
		const instance = new Vault();
		fromBinary(instance, bytes, options);
		return instance;
	}

	static fromJson(jsonValue, options) {
		return fromJson(Vault, jsonValue, options);
	}

	static fromJsonString(jsonString, options) {
		return fromJsonString(Vault, jsonString, options);
	}

	static equals(a, b) {
		return equals(Vault, a, b);
	}
}
