export default async function handler(req, res) {
  const { rdToken, magnet, pcloudAuth, folderid } = req.query;

  if (!rdToken || !magnet || !pcloudAuth || !folderid) {
    return res.status(400).json({ error: '❌ 필수 항목 누락' });
  }

  try {
    // 1. 마그넷 등록
    const added = await fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
      method: "POST",
      headers: { Authorization: `Bearer ${rdToken}` },
      body: new URLSearchParams({ magnet })
    }).then(r => r.json());

    const tid = added.id;

    // 2. 파일 선택
    const info = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${tid}`, {
      headers: { Authorization: `Bearer ${rdToken}` }
    }).then(r => r.json());

    const fileIds = info.files.map(f => f.id).join(",");
    await fetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${tid}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rdToken}` },
      body: new URLSearchParams({ files: fileIds })
    });

    // 3. 다운로드 대기
    let links = [];
    for (let i = 0; i < 40; i++) {
      const status = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${tid}`, {
        headers: { Authorization: `Bearer ${rdToken}` }
      }).then(r => r.json());

      if (status.status === "downloaded") {
        links = status.links;
        break;
      }
      await new Promise(res => setTimeout(res, 3000));
    }

    if (!links.length) throw new Error("다운로드 실패 또는 시간 초과");

    // 4. 링크 언리스트릭트
    const unrestricted = await Promise.all(
      links.map(link => fetch("https://api.real-debrid.com/rest/1.0/unrestrict/link", {
        method: "POST",
        headers: { Authorization: `Bearer ${rdToken}` },
        body: new URLSearchParams({ link })
      }).then(r => r.json()))
    );

    // 5. pCloud 업로드
    const result = [];
    for (const link of unrestricted) {
      const remote = await fetch(`https://api.pcloud.com/remoteupload?auth=${pcloudAuth}&url=${encodeURIComponent(link.download)}&folderid=${folderid}`);
      result.push(await remote.json());
    }

    return res.status(200).json({ success: true, uploaded: result });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
