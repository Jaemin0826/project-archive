/* TV Archive seed — dates relative to 2026-11-07 */
(function () {
  const img = (n) => `images/th-${String(n).padStart(2, "0")}.jpg`;

  function u(id, channelId, date, title, description, mood, files, extra) {
    return Object.assign(
      {
        id,
        channelId,
        date,
        title,
        description,
        nextTodo: "",
        mood: mood || "😊",
        private: false,
        files: files || [],
      },
      extra || {}
    );
  }

  function file(type, n, name) {
    return { type, src: img(n), name: name || "" };
  }

  const mintexChannels = [
    { id: "mx-ui", name: "UI" },
    { id: "mx-char", name: "캐릭터" },
    { id: "mx-dir", name: "연출" },
  ];

  const mintexMeta = [
    ["2026-11-03", "mx-ui", "온보딩 플로우 수정", "첫 실행을 3스텝으로 줄였다.", "😐", 5],
    ["2026-11-01", "mx-char", "캐릭터 표정 개선", "기쁨 표정 입 라인을 다시 그렸다.", "🔥", 7],
    ["2026-10-26", "mx-dir", "타이틀 연출 러프", "로고가 켜지듯 페이드인.", "✨", 6],
    ["2026-10-21", "mx-ui", "홈 대시보드 카드", "진행률 링 추가.", "😊", 5],
    ["2026-10-16", "mx-char", "NPC 상점 주인", "실루엣 2안 중 둥근 체형 채택.", "😊", 7],
    ["2026-10-11", "mx-ui", "설정 페이지 와이어", "접근성 대비 점검 메모.", "😐", 9],
    ["2026-10-05", "mx-dir", "클리어 연출 스케치", "폭죽 대신 TV 지지직.", "🔥", 11],
    ["2026-09-28", "mx-char", "주인공 측면 턴", "고개 각도 15도만 틀기.", "😊", 2],
    ["2026-09-22", "mx-ui", "인벤토리 슬롯 9개", "길게 누르면 툴팁.", "😐", 5],
    ["2026-09-15", "mx-dir", "게임오버 화면", "노이즈 속에 문구만.", "😵", 15],
    ["2026-09-08", "mx-char", "적 캐릭터 세 마리", "한 실루엣 패밀리로 묶음.", "🔥", 7],
    ["2026-09-01", "mx-ui", "컬러 토큰 정리", "다크 배경 위 포인트 레드.", "✨", 9],
    ["2026-08-24", "mx-dir", "오프닝 8초 컷", "방송국 켜지는 연출.", "😊", 6],
    ["2026-08-17", "mx-ui", "로그인 없는 게스트 흐름", "암호 한 줄만 받는 패널.", "😐", 5],
    ["2026-08-10", "mx-char", "마스코트 더미", "동그란 블롭. 나중에 교체.", "😊", 1],
    ["2026-08-03", "mx-dir", "채널 전환 트랜지션", "지지직 8프레임.", "🔥", 15],
    ["2026-07-27", "mx-ui", "검색 결과 리스트", "썸네일 + 상태 배지.", "😊", 9],
    ["2026-07-18", "mx-char", "표정 시트 초안", "기쁨 중립 지침 세 장.", "😐", 2],
    ["2026-07-09", "mx-dir", "RECAP 페이지 스케치", "세로 스크롤 한 장.", "✨", 4],
    ["2026-06-28", "mx-ui", "미니맵 초안", "켜진 TV만 밝게.", "😊", 8],
    ["2026-06-16", "mx-char", "세계관 메모 정리", "밤의 TV 벽이 무대.", "😐", 12],
    ["2026-06-04", "mx-ui", "프로젝트 킥오프", "화면 흐름 낙서.", "🔥", 5],
  ];

  const mintexUpdates = mintexMeta.map((row, i) =>
    u(
      "mx-u" + (i + 1),
      row[1],
      row[0],
      row[2],
      row[3],
      row[4],
      [file("image", row[5], row[2])],
      { nextTodo: i === 0 ? "고객 인터뷰 노트 반영" : "" }
    )
  );

  window.TV_SEED = {
    categories: ["이미지", "영상", "3D", "사갈"],
    recap: { x: 5, y: 0 },
    projects: [
      {
        id: "p-star",
        name: "별빛 탐험대",
        category: "사갈",
        completed: false,
        private: false,
        nextTodo: "주인공 표정 시트 2차 채색",
        x: 6,
        y: 0,
        channels: [
          { id: "pt-illust", name: "일러스트" },
          { id: "pt-bg", name: "배경" },
          { id: "pt-ui", name: "UI" },
          { id: "pt-3d", name: "3D 에셋" },
        ],
        updates: [
          u("s1", "pt-illust", "2026-11-06", "주인공 표정 시트 1차", "기쁨/놀람/화남 3종. 라인만 먼저 잡음.", "🔥", [
            file("image", 2, "표정 기쁨"),
            file("image", 7, "표정 놀람"),
            file("image", 1, "표정 화남"),
          ], { nextTodo: "2차 채색" }),
          u("s2", "pt-bg", "2026-11-04", "스테이지 1 배경 스케치", "숲 입구 시점. 원경 실루엣 위주.", "✨", [file("image", 12, "숲 입구")]),
          u("s3", "pt-ui", "2026-11-02", "인벤토리 와이어", "슬롯 6개 + 툴팁. 컬러는 아직.", "😊", [file("image", 5, "인벤토리")]),
          u("s4", "pt-3d", "2026-10-28", "포탈 프랍 블록아웃", "로우폴리 형태만. 텍스처는 다음 주.", "😐", [
            file("model3d", 8, "포탈 블록아웃"),
          ]),
          u("s5", "pt-illust", "2026-10-22", "적 캐릭터 A 콘셉트", "실루엣 3안 중 2안 채택.", "🔥", [file("image", 7, "적 A")]),
          u("s6", "pt-bg", "2026-10-15", "마을 원경", "저녁 보라 톤으로 맞추는 중.", "😊", [file("image", 12, "마을")]),
          u("s7", "pt-illust", "2026-10-07", "주인공 실루엣 3안", "한 달 전 오늘의 선택. 2안이 채택됐다.", "✨", [file("image", 2, "실루엣")]),
          u("s8", "pt-ui", "2026-09-28", "타이틀 화면 초안", "로고 위치만 잡음.", "😐", [file("image", 5, "타이틀")]),
          u("s9", "pt-3d", "2026-09-18", "나무 모듈", "재사용 가능한 세 그루.", "😐", [file("model3d", 8, "나무")]),
          u("s10", "pt-bg", "2026-09-05", "동굴 입구", "대비가 강해 조금 지침.", "😵", [file("image", 13, "동굴")]),
          u("s11", "pt-illust", "2026-08-20", "파티 멤버 B", "짧은 머리, 노란 스카프.", "😊", [file("image", 7, "멤버 B")]),
          u("s12", "pt-illust", "2026-08-07", "세계관 무드보드", "밤하늘과 TV 불빛.", "✨", [file("image", 1, "무드보드")]),
        ],
      },
      {
        id: "p-poster",
        name: "캠퍼스 페스티벌 포스터",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "인쇄용 PDF 보내기",
        x: 3,
        y: 0,
        channels: [{ id: "pp1", name: "메인 비주얼" }],
        updates: [
          u("po1", "pp1", "2026-11-07", "인쇄 가이드 정리", "여백 3mm, 야간 톤 유지.", "😊", [
            file("image", 4, "포스터 최종"),
            file("image", 11, "컬러 바리에이션"),
          ], { nextTodo: "인쇄용 PDF 보내기" }),
          u("po2", "pp1", "2026-10-20", "컬러 2차 조정", "야간 톤으로 변경.", "✨", [file("image", 4, "야간 톤")]),
          u("po3", "pp1", "2026-10-01", "스케치 1안", "무대와 군중 실루엣.", "😐", [file("image", 13, "스케치")]),
        ],
      },
      {
        id: "p-banner",
        name: "시즌 배너 시리즈",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "겨울 배너 눈 파티클",
        x: 4,
        y: 0,
        channels: [
          { id: "pbn1", name: "가을" },
          { id: "pbn2", name: "겨울" },
        ],
        updates: [
          u("bn1", "pbn2", "2026-10-27", "겨울 배너 1안", "눈 파티클 레이어 추가 예정.", "✨", [file("image", 11, "겨울 1안")]),
          u("bn2", "pbn1", "2026-10-12", "가을 배너 확정", "승인 완료.", "😊", [file("image", 6, "가을 확정")]),
        ],
      },
      {
        id: "p-tracker",
        name: "습관 트래커 앱 UI",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "통계 차트 인터랙션",
        x: 3,
        y: 1,
        channels: [
          { id: "pa1", name: "온보딩" },
          { id: "pa2", name: "홈" },
          { id: "pa3", name: "통계" },
        ],
        updates: [
          u("tr1", "pa2", "2026-10-30", "홈 카드 컴포넌트", "체크 인터랙션 스펙 정리.", "😐", [file("image", 5, "홈 카드")]),
          u("tr2", "pa3", "2026-10-18", "주간 그래프 초안", "막대에서 꺾은선으로.", "😊", [file("image", 9, "그래프")]),
          u("tr3", "pa1", "2026-10-08", "온보딩 3컷 확정", "카피 수정 반영.", "😊", [file("image", 5, "온보딩")]),
          u("tr4", "pa2", "2026-09-26", "습관 추가 시트", "바텀시트 높이 조절.", "😐", [file("image", 9, "시트")]),
          u("tr5", "pa3", "2026-09-14", "빈 상태 일러스트", "아직 습관이 없을 때.", "✨", [file("image", 1, "빈 상태")]),
          u("tr6", "pa2", "2026-08-29", "알림 토글", "마이크로카피 다듬는 중.", "😐", [file("image", 10, "알림")]),
          u("tr7", "pa1", "2026-08-16", "플로우 낙서", "첫 화면부터 홈까지.", "🔥", [file("image", 9, "플로우")]),
        ],
      },
      {
        id: "p-luna",
        name: "캐릭터 시트 — 루나",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "의상 뒷모습 추가",
        x: 1,
        y: 1,
        channels: [
          { id: "pc1", name: "얼굴" },
          { id: "pc2", name: "의상" },
        ],
        updates: [
          u("lu1", "pc1", "2026-10-18", "표정 추가 2종", "졸림 / 당황.", "😵", [file("image", 7, "표정")]),
          u("lu2", "pc2", "2026-10-02", "겨울 코트 시안", "넥 라인이 너무 높음.", "😐", [file("image", 14, "코트")]),
          u("lu3", "pc1", "2026-09-16", "정면 얼굴 확정", "눈 하이라이트 위치 고정.", "😊", [file("image", 2, "정면")]),
        ],
      },
      {
        id: "p-light",
        name: "로비 씬 라이팅",
        category: "3D",
        completed: false,
        private: false,
        nextTodo: "노출값 맞추기",
        x: 2,
        y: 1,
        channels: [
          { id: "p3a", name: "모델링" },
          { id: "p3b", name: "라이팅" },
        ],
        updates: [
          u("li1", "p3b", "2026-10-13", "HDRI + 포인트라이트", "노출 맞추는 중.", "😐", [
            file("model3d", 8, "로비 라이팅"),
          ]),
          u("li2", "p3a", "2026-09-25", "로비 블록아웃", "기둥 간격 재배치.", "😊", [file("model3d", 8, "블록아웃")]),
        ],
      },
      {
        id: "p-mintex",
        name: "미니텍스코어",
        category: "사갈",
        completed: false,
        private: false,
        nextTodo: "고객 인터뷰 노트 반영",
        x: 0,
        y: 2,
        channels: mintexChannels,
        updates: mintexUpdates,
      },
      {
        id: "p-cafe",
        name: "카페 로고 리뉴얼",
        category: "이미지",
        completed: true,
        private: false,
        nextTodo: "",
        x: 0,
        y: 0,
        channels: [
          { id: "pb1", name: "로고" },
          { id: "pb2", name: "패키지" },
        ],
        updates: [
          u("cf1", "pb1", "2026-09-18", "최종 납품", "SVG + PNG 세트 전달.", "😊", [file("image", 3, "최종 로고")]),
          u("cf2", "pb2", "2026-09-02", "컵홀더 시안", "2종 컬러웨이.", "✨", [file("image", 4, "컵홀더")]),
          u("cf3", "pb1", "2026-08-11", "워드마크 정리", "자간을 한 단계 조임.", "😐", [file("image", 3, "워드마크")]),
          u("cf4", "pb1", "2026-07-20", "스케치 다섯 장", "원형 뱃지안이 선택됨.", "🔥", [file("image", 10, "스케치")]),
        ],
      },
      {
        id: "p-secret",
        name: "비밀 작업실",
        category: "이미지",
        completed: false,
        private: true,
        nextTodo: "시안 정리해서 보내기",
        x: 5,
        y: 1,
        channels: [{ id: "ps1", name: "시안" }],
        updates: [
          u("se1", "ps1", "2026-11-05", "비공개 시안 2차", "아직 외부에 나가면 안 되는 컷.", "😊", [file("image", 14, "시안 2차")], {
            private: true,
            nextTodo: "시안 정리해서 보내기",
          }),
          u("se2", "ps1", "2026-10-19", "구도 탐색", "인물 배치만.", "😐", [file("image", 13, "구도")]),
          u("se3", "ps1", "2026-10-03", "레퍼런스 보드", "색만 모아둠.", "✨", [file("image", 6, "레퍼런스")]),
        ],
      },
      {
        id: "p-motion",
        name: "브랜드 오프닝 모션",
        category: "영상",
        completed: false,
        private: false,
        nextTodo: "클라이언트 피드백 반영",
        x: 0,
        y: 1,
        channels: [{ id: "pm1", name: "메인 시퀀스" }],
        updates: [
          u("mo1", "pm1", "2026-09-10", "러프 애니 15초", "클라이언트 피드백 대기 중.", "😢", [
            file("video", 15, "러프 15초"),
          ]),
          u("mo2", "pm1", "2026-08-07", "스토리보드 8컷", "세 달 전 오늘의 보드.", "😐", [file("image", 15, "스토리보드")]),
        ],
      },
      {
        id: "p-folio",
        name: "포트폴리오 리뉴얼",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "그리드 다시 잡기",
        x: 1,
        y: 0,
        channels: [{ id: "pw1", name: "레이아웃" }],
        updates: [
          u("fo1", "pw1", "2026-06-20", "그리드 실험 중단", "다른 프로젝트 우선.", "😵", [file("image", 9, "그리드")]),
          u("fo2", "pw1", "2025-11-07", "첫 레이아웃 낙서", "1년 전 오늘, 카드형으로 시작.", "🔥", [file("image", 9, "낙서")]),
        ],
      },
      {
        id: "p-icons",
        name: "앱 아이콘 세트",
        category: "이미지",
        completed: false,
        private: false,
        nextTodo: "24px 라인 두께 재검토",
        x: 2,
        y: 0,
        channels: [{ id: "pi1", name: "24px 세트" }],
        updates: [
          u("ic1", "pi1", "2026-07-01", "48개 아이콘 초안", "아웃라인 / 필 2스타일.", "😐", [file("image", 10, "아이콘")]),
        ],
      },
    ],
    trash: [],
  };
})();
