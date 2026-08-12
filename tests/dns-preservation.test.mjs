import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../convert.js", import.meta.url), "utf8");

function convert(config, args = {}) {
    const context = { $arguments: { grouptype: "0", ...args } };
    vm.runInNewContext(script, context);
    return structuredClone(context.main(structuredClone(config)));
}

const proxy = {
    name: "测试节点",
    type: "vless",
    server: "example.com",
    port: 443,
};

test("preserves upstream DNS fields and fills missing defaults", () => {
    const upstreamDns = {
        enable: true,
        ipv6: true,
        "enhanced-mode": "redir-host",
        nameserver: ["https://resolver.example/dns-query"],
        "nameserver-policy": {
            "+.provider.example": ["https://provider.example/dns-query/token"],
        },
        "fallback-filter": {
            geoip: true,
            "geoip-code": "CN",
        },
    };

    const result = convert({ proxies: [proxy], dns: upstreamDns });

    assert.deepEqual(result.dns.nameserver, upstreamDns.nameserver);
    assert.deepEqual(result.dns["nameserver-policy"], upstreamDns["nameserver-policy"]);
    assert.deepEqual(result.dns["fallback-filter"], upstreamDns["fallback-filter"]);
    assert.equal(result.dns["proxy-server-nameserver"], undefined);
    assert.equal(result.dns.ipv6, false);
    assert.equal(result.dns["enhanced-mode"], "fake-ip");
});

test("uses generated DNS defaults when upstream DNS is absent", () => {
    const result = convert({ proxies: [proxy] });

    assert.equal(result.dns.enable, true);
    assert.equal(result.dns["enhanced-mode"], "fake-ip");
    assert.deepEqual(result.dns.nameserver, ["system", "223.5.5.5", "119.29.29.29", "180.184.1.1"]);
    assert.deepEqual(Object.keys(result.dns["nameserver-policy"]), [
        "geosite:cn",
        "geosite:geolocation-!cn",
    ]);
    assert.equal(result.dns["proxy-server-nameserver"], undefined);
});

test("keeps invalid legacy entries out of fake-ip filter and sniffer skip-domain", () => {
    const result = convert({ proxies: [proxy] });

    assert.ok(result.dns["fake-ip-filter"].includes("geosite:private"));
    assert.equal(result.dns["fake-ip-filter"].includes("Mijia Cloud"), false);
    assert.ok(result.sniffer["skip-domain"].includes("+.push.apple.com"));
    assert.equal(result.sniffer["skip-domain"].includes("Mijia Cloud"), false);
});

test("preserves an upstream proxy server nameserver", () => {
    const proxyServerNameserver = ["https://resolver.example/dns-query"];
    const result = convert({
        proxies: [proxy],
        dns: { "proxy-server-nameserver": proxyServerNameserver },
    });

    assert.deepEqual(result.dns["proxy-server-nameserver"], proxyServerNameserver);
});

test("does not generate DoggyGo DNS policy unless explicitly enabled", () => {
    const doggyProxy = {
        ...proxy,
        type: "anytls",
        server: "1hk.quandao.com",
        password: "test-provider-token",
    };

    const result = convert({ proxies: [doggyProxy] });

    assert.deepEqual(Object.keys(result.dns["nameserver-policy"]), [
        "geosite:cn",
        "geosite:geolocation-!cn",
    ]);
});

test("generates DoggyGo DNS policy from matching nodes when enabled", () => {
    const doggyProxy = {
        ...proxy,
        type: "anytls",
        server: "cdn.jiandaoyun.com",
        password: "test-provider-token",
    };

    const result = convert({ proxies: [doggyProxy] }, { doggyDns: "true" });

    const providerResolvers = [
        "https://doh.dohcore.com:2096/dns-query/test-provider-token#skip-cert-verify=true",
        "https://doh.cloudflare-lab.com:2096/dns-query/test-provider-token#skip-cert-verify=true",
    ];
    assert.deepEqual(result.dns["nameserver-policy"], {
        "+.quandao.com": providerResolvers,
        "+.jiandaoyun.com": providerResolvers,
        "geosite:cn": ["223.5.5.5", "119.29.29.29", "180.184.1.1"],
        "geosite:geolocation-!cn": [
            "quic://dns0.eu",
            "https://dns.cloudflare.com/dns-query",
            "https://dns.sb/dns-query",
            "tcp://208.67.222.222",
            "tcp://8.26.56.2",
        ],
    });
    assert.equal(result.dns["proxy-server-nameserver"], undefined);
});

test("keeps the default split when DoggyGo DNS has no matching node", () => {
    const result = convert({ proxies: [proxy] }, { doggyDns: "true" });

    assert.deepEqual(Object.keys(result.dns["nameserver-policy"]), [
        "geosite:cn",
        "geosite:geolocation-!cn",
    ]);
});

test("keeps an upstream DNS policy when DoggyGo DNS is enabled", () => {
    const upstreamPolicy = {
        "+.provider.example": ["https://provider.example/dns-query"],
    };
    const result = convert(
        {
            proxies: [
                {
                    ...proxy,
                    type: "anytls",
                    server: "1hk.quandao.com",
                    password: "test-provider-token",
                },
            ],
            dns: { "nameserver-policy": upstreamPolicy },
        },
        { doggyDns: "true" }
    );

    assert.deepEqual(result.dns["nameserver-policy"], upstreamPolicy);
});
