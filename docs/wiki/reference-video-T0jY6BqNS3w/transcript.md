---
type: reference
title: Transcript, ETHGlobal reference demo video (web3torrent, HackMoney 2020)
updated: 2026-09-13
sources:
  - https://www.youtube.com/watch?v=T0jY6BqNS3w (downloaded 2026-09-13 to [local path, withheld])
  - WhisperKit openai_whisper-large-v3 (word timestamps, language auto-detected: en), run 2026-09-13 on this Mac
---

# Transcript: web3torrent HackMoney demo video

Segments as produced by WhisperKit large-v3, timestamps are segment start to end (mm:ss.ss). Two speakers (Liam Horne, Kartik Talwar); WhisperKit marked speaker changes with a leading dash only at 00:11 and 00:14, speaker attribution after that is unverified. Proper nouns corrected against the YouTube auto captions where both agree: "Ganache" (WhisperKit heard "Ganesh"). WhisperKit "megaway" is the spoken "Mwei" (megawei), left as heard. A trailing no-speech token at 03:37 was dropped.

00:03.82 to 00:06.26  - Okay, so we are team Web3Torrent,
00:06.60 to 00:08.06  and this is what we built for Hack Money.
00:08.90 to 00:10.80  My name is Liam Horne, and I worked in the back end.
00:11.14 to 00:12.84  - I'm Kartik, and I worked on the front end.
00:14.12 to 00:16.56  - So we built an app that lets you pay for torrents
00:16.56 to 00:18.52  on the web through micropayments of ETH,
00:18.82 to 00:19.86  built on top of state channels.
00:20.42 to 00:29.60  It uses WebTorrent under the hood, which is a web-based torrenting technology to create state channels through a hub ring and a server in the backend.
00:30.69 to 00:34.74  And you can make payments through sections of the file that you're downloading.
00:35.35 to 00:39.16  So each small number of bytes and each message is encoded with a signed state.
00:40.05 to 00:41.02  So let's jump into the demo.
00:50.27 to 00:50.38  All right.
00:42.66 to 00:44.36  We're going to show on the left,
00:44.46 to 00:46.62  a user is going to upload a file.
00:47.22 to 00:49.14  So we'll choose just a file.
00:49.14 to 00:50.20  I have my laptop here.
00:51.32 to 00:53.60  What they do is they connect to their MetaMask.
00:53.96 to 00:56.42  This is a local one running with my Ganache.
00:58.14 to 01:00.82  They create a budget with the wallet we have in
01:01.06 to 01:04.10  this application here which will
01:04.12 to 01:05.74  then lead to creating a channel with the Hub.
01:06.22 to 01:07.66  The Hub deposits in the background,
01:08.32 to 01:10.36  and the user then makes their own deposit.
01:11.32 to 01:17.32  and you're gonna see once the deposit is done the channel is created with the hub
01:17.44 to 01:21.72  and now it's ready for a leacher to come along and download so we're going to
01:21.76 to 01:27.26  take the link that was generated and go to the other window go to the same
01:27.40 to 01:32.68  process of connecting metamask and making a channel with the hub
01:36.26 to 01:38.32  And then once that's done,
01:38.41 to 01:41.38  you can see that this other window
01:41.45 to 01:42.28  is gonna start downloading.
01:44.20 to 01:45.62  And so that's what you can see happening now.
01:46.43 to 01:48.48  So what's happening is that each incremental,
01:49.76 to 01:50.88  some number of bytes,
01:51.52 to 01:57.74  The downloader is paying using ETH, a small amount. You can see it's about a conversion rate of
01:58.74 to 02:08.90  one megabyte, one megaway. The downloader is spending megaway. The leecher is earning megaway. And you can see that the total amount is about 4.7. And once the download is done,
02:09.52 to 02:17.12  where each of these things science updates gets to be a channel update in the two users channels.
02:17.64 to 02:19.70  The channel closes and the file is downloaded.
02:20.48 to 02:22.40  And then you can see the other browser that has it.
02:23.30 to 02:24.24  So that's the demo.
02:25.48 to 02:36.94  What's going on? So there's three pieces of technology here. There's a hub running in the background. It's a Node.js server, a wallet running within an iframe of the application, and the actual application itself, which is what you just saw.
02:37.60 to 02:40.68  So we had to design a protocol completely from scratch to make this work.
02:41.12 to 02:46.26  And that protocol then had to run completely on top of the BitTorrent protocol such that
02:46.56 to 02:51.66  each message is exchanged in a way that is using the existing message transfer mechanism
02:52.10 to 02:52.60  of WebTorrent.
02:53.48 to 02:56.90  We did that so there's no bloat and made it so it was fast enough to work in the browser.
02:57.52 to 03:00.74  We also have a security model between the wallet and the app, so the app can't actually
03:00.88 to 03:03.24  access the private key or any of the funds of the wallet.
03:03.60 to 03:05.16  The wallet has autonomy over that information.
03:08.42 to 03:10.74  So future work, we want to take this to mainnet
03:10.81 to 03:12.86  and make it available for anybody else to use.
03:13.01 to 03:16.20  And we also want to add support for other stable coins
03:16.43 to 03:19.06  so you can pay in DAI or USDC instead of just ETH,
03:19.59 to 03:21.54  which also makes it ready for us to do some
03:22.02 to 03:23.36  interesting things like gas abstraction.
03:24.02 to 03:29.30  And you can also check this out live directly by going to web3torrent.xyz.
03:30.16 to 03:33.20  We had a lot of fun working on this thing for Hack Money.
03:33.79 to 03:36.40  And thank you so much for your time.
03:37.12 to 03:37.56  Thanks.
