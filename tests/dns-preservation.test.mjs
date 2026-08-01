import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../convert.js", import.meta.url), "utf8");

function convert(config) {
    const context = { $arguments: { grouptype: "0" } };
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
    assert.deepEqual(result.dns["proxy-server-nameserver"], [
        "https://dns.alidns.com/dns-query",
        "tls://dot.pub",
    ]);
    assert.equal(result.dns.ipv6, false);
    assert.equal(result.dns["enhanced-mode"], "fake-ip");
});

test("uses generated DNS defaults when upstream DNS is absent", () => {
    const result = convert({ proxies: [proxy] });

    assert.equal(result.dns.enable, true);
    assert.equal(result.dns["enhanced-mode"], "fake-ip");
    assert.deepEqual(result.dns.nameserver, ["system", "223.5.5.5", "119.29.29.29", "180.184.1.1"]);
    assert.equal(result.dns["nameserver-policy"], undefined);
});

test("restores provider DNS policy when SubStore strips upstream DNS", () => {
    const password = "test-provider-token";
    const result = convert({
        proxies: [
            {
                ...proxy,
                server: "edge.quandao.com",
                password,
            },
        ],
    });

    assert.deepEqual(result.dns["nameserver-policy"], {
        "+.quandao.com": [
            `https://doh.dohcore.com:2096/dns-query/${password}#skip-cert-verify=true`,
            `https://doh.cloudflare-lab.com:2096/dns-query/${password}#skip-cert-verify=true`,
        ],
    });
});
