package org.nachweis.prover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.nachweis.prover.circuit.Codec
import org.nachweis.prover.net.Handoff

class HandoffTest {
    private val sid = "aa7d4435-c509-46b1-83b1-7c0cb9ca55ca"
    private val addr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    private val ch = "7426bd0ea9dbe592f719371e370251246c99a1838fe3c2bf5646e90221f69df2"
    private val nonce = Codec.toHex(Codec.sha256(Codec.hex(addr) + Codec.hex(ch)))

    @Test
    fun compactJsonFromTheWebApp() {
        val h = Handoff.parse("""{"v":1,"s":"$sid","a":"$addr","c":"$ch","r":"http://10.0.2.2:8090","b":"http://10.0.2.2:8788/"}""")
        assertEquals(sid, h.sessionId)
        assertEquals(addr.lowercase(), h.boundAddress)
        assertEquals(ch, h.challengeHex)
        assertEquals(nonce, h.nonce)
        assertEquals("http://10.0.2.2:8090", h.verifierUrl)
        assertEquals("http://10.0.2.2:8788", h.bridgeUrl)
    }

    @Test
    fun uriWithEncodedUrlsAndPrefixedChallenge() {
        val h = Handoff.parse("nachweis://handoff?v=1&s=$sid&a=$addr&c=0x$ch&b=http%3A%2F%2F127.0.0.1%3A8788&r=http%3A%2F%2F127.0.0.1%3A8090")
        assertEquals(ch, h.challengeHex)
        assertEquals("http://127.0.0.1:8788", h.bridgeUrl)
        assertEquals("http://127.0.0.1:8090", h.verifierUrl)
        assertEquals(nonce, h.nonce)
    }

    @Test
    fun bridgeBodyWithNonceCrossCheck() {
        val h = Handoff.parse("""{"session_id":"$sid","bound_address":"$addr","challenge_hex":"$ch","nonce":"$nonce","verifier_url":null,"bridge_url":"http://127.0.0.1:8788","expires_at":1}""")
        assertNull(h.verifierUrl)
        assertEquals(nonce, h.nonce)
        assertThrows(IllegalArgumentException::class.java) {
            Handoff.parse("""{"session_id":"$sid","bound_address":"$addr","challenge_hex":"$ch","nonce":"${"00".repeat(32)}","bridge_url":"http://x"}""")
        }
    }

    @Test
    fun rejectsBadInput() {
        assertThrows(IllegalArgumentException::class.java) { Handoff.parse("hello") }
        assertThrows(IllegalArgumentException::class.java) { Handoff.parse("""{"v":2,"s":"$sid","a":"$addr","c":"$ch","b":"http://x"}""") }
        assertThrows(IllegalArgumentException::class.java) { Handoff.parse("""{"v":1,"s":"nope","a":"$addr","c":"$ch","b":"http://x"}""") }
        assertThrows(IllegalArgumentException::class.java) { Handoff.parse("""{"v":1,"s":"$sid","a":"$addr","c":"${ch.drop(2)}","b":"http://x"}""") }
        assertThrows(IllegalArgumentException::class.java) { Handoff.parse("""{"v":1,"s":"$sid","a":"$addr","c":"$ch","b":"ftp://x"}""") }
    }
}
