/* Sample seed data — Project > Parts > Updates */
window.ARCHIVE_SEED = {
  categories: ["게임", "브랜딩", "일러스트", "UI/UX", "모션"],
  projects: [
    {
      id: "p-game",
      name: "별빛 탐험대",
      category: "게임",
      status: "진행 중",
      cover: "images/th-01.jpg",
      mediaType: "image",
      started: "2025-08-12",
      updated: "2025-11-05",
      parts: [
        { id: "pt-illust", name: "일러스트", status: "진행 중" },
        { id: "pt-bg", name: "배경", status: "진행 중" },
        { id: "pt-ui", name: "UI", status: "보류" },
        { id: "pt-3d", name: "3D 에셋", status: "진행 중" }
      ],
      updates: [
        {
          id: "u1",
          partId: "pt-illust",
          date: "2025-11-05",
          title: "주인공 표정 시트 1차",
          detail: "기쁨/놀람/화남 3종. 라인만 먼저 잡음.",
          media: [{ type: "image", src: "images/th-02.jpg" }]
        },
        {
          id: "u2",
          partId: "pt-bg",
          date: "2025-11-03",
          title: "스테이지 1 배경 스케치",
          detail: "숲 입구 시점. 원경 실루엣 위주.",
          media: [{ type: "image", src: "images/th-12.jpg" }]
        },
        {
          id: "u3",
          partId: "pt-3d",
          date: "2025-10-28",
          title: "포탈 프랍 블록아웃",
          detail: "로우폴리 형태만. 텍스처는 다음 주.",
          media: [{ type: "model3d", src: "images/th-08.jpg" }]
        },
        {
          id: "u4",
          partId: "pt-ui",
          date: "2025-10-20",
          title: "인벤토리 와이어",
          detail: "슬롯 6개 + 툴팁. 컬러는 아직.",
          media: [{ type: "image", src: "images/th-05.jpg" }]
        },
        {
          id: "u5",
          partId: "pt-illust",
          date: "2025-10-12",
          title: "적 캐릭터 A 콘셉트",
          detail: "실루엣 3안 중 2안 채택.",
          media: [{ type: "image", src: "images/th-07.jpg" }]
        }
      ]
    },
    {
      id: "p-brand",
      name: "카페 로고 리뉴얼",
      category: "브랜딩",
      status: "완료",
      cover: "images/th-03.jpg",
      mediaType: "image",
      started: "2025-06-01",
      updated: "2025-09-18",
      parts: [
        { id: "pb1", name: "로고", status: "완료" },
        { id: "pb2", name: "패키지", status: "완료" }
      ],
      updates: [
        {
          id: "ub1",
          partId: "pb1",
          date: "2025-09-18",
          title: "최종 납품",
          detail: "SVG + PNG 세트 전달.",
          media: [{ type: "image", src: "images/th-03.jpg" }]
        },
        {
          id: "ub2",
          partId: "pb2",
          date: "2025-09-02",
          title: "컵홀더 시안",
          detail: "2종 컬러웨이.",
          media: [{ type: "image", src: "images/th-04.jpg" }]
        }
      ]
    },
    {
      id: "p-poster",
      name: "캠퍼스 페스티벌 포스터",
      category: "일러스트",
      status: "진행 중",
      cover: "images/th-04.jpg",
      mediaType: "image",
      started: "2025-10-01",
      updated: "2025-11-01",
      parts: [{ id: "pp1", name: "메인 비주얼", status: "진행 중" }],
      updates: [
        {
          id: "up1",
          partId: "pp1",
          date: "2025-11-01",
          title: "컬러 2차 조정",
          detail: "야간 톤으로 변경.",
          media: [{ type: "image", src: "images/th-04.jpg" }]
        }
      ]
    },
    {
      id: "p-app",
      name: "습관 트래커 앱 UI",
      category: "UI/UX",
      status: "진행 중",
      cover: "images/th-05.jpg",
      mediaType: "image",
      started: "2025-09-10",
      updated: "2025-11-04",
      parts: [
        { id: "pa1", name: "온보딩", status: "완료" },
        { id: "pa2", name: "홈", status: "진행 중" },
        { id: "pa3", name: "통계", status: "보류" }
      ],
      updates: [
        {
          id: "ua1",
          partId: "pa2",
          date: "2025-11-04",
          title: "홈 카드 컴포넌트",
          detail: "체크 인터랙션 스펙 정리.",
          media: [{ type: "image", src: "images/th-05.jpg" }]
        },
        {
          id: "ua2",
          partId: "pa1",
          date: "2025-10-15",
          title: "온보딩 3컷 확정",
          detail: "카피 수정 반영.",
          media: []
        }
      ]
    },
    {
      id: "p-motion",
      name: "브랜드 오프닝 모션",
      category: "모션",
      status: "보류",
      cover: "images/th-06.jpg",
      mediaType: "video",
      started: "2025-07-20",
      updated: "2025-08-30",
      parts: [{ id: "pm1", name: "메인 시퀀스", status: "보류" }],
      updates: [
        {
          id: "um1",
          partId: "pm1",
          date: "2025-08-30",
          title: "러프 애니 15초",
          detail: "클라이언트 피드백 대기 중.",
          media: [{ type: "video", src: "images/th-15.jpg" }]
        }
      ]
    },
    {
      id: "p-char",
      name: "캐릭터 시트 — 루나",
      category: "일러스트",
      status: "진행 중",
      cover: "images/th-07.jpg",
      mediaType: "image",
      started: "2025-10-08",
      updated: "2025-11-02",
      parts: [
        { id: "pc1", name: "얼굴", status: "진행 중" },
        { id: "pc2", name: "의상", status: "진행 중" }
      ],
      updates: [
        {
          id: "uc1",
          partId: "pc1",
          date: "2025-11-02",
          title: "표정 추가 2종",
          detail: "졸림 / 당황.",
          media: [{ type: "image", src: "images/th-07.jpg" }]
        }
      ]
    },
    {
      id: "p-3d",
      name: "로비 씬 라이팅",
      category: "게임",
      status: "진행 중",
      cover: "images/th-08.jpg",
      mediaType: "model3d",
      started: "2025-09-25",
      updated: "2025-10-30",
      parts: [
        { id: "p3a", name: "모델링", status: "완료" },
        { id: "p3b", name: "라이팅", status: "진행 중" }
      ],
      updates: [
        {
          id: "u3a",
          partId: "p3b",
          date: "2025-10-30",
          title: "HDRI + 포인트라이트",
          detail: "노출 맞추는 중.",
          media: [{ type: "model3d", src: "images/th-08.jpg" }]
        }
      ]
    },
    {
      id: "p-web",
      name: "포트폴리오 리뉴얼",
      category: "UI/UX",
      status: "보류",
      cover: "images/th-09.jpg",
      mediaType: "image",
      started: "2025-05-01",
      updated: "2025-07-12",
      parts: [{ id: "pw1", name: "레이아웃", status: "보류" }],
      updates: [
        {
          id: "uw1",
          partId: "pw1",
          date: "2025-07-12",
          title: "그리드 실험 중단",
          detail: "다른 프로젝트 우선.",
          media: [{ type: "image", src: "images/th-09.jpg" }]
        }
      ]
    },
    {
      id: "p-icon",
      name: "앱 아이콘 세트",
      category: "UI/UX",
      status: "완료",
      cover: "images/th-10.jpg",
      mediaType: "image",
      started: "2025-04-10",
      updated: "2025-05-22",
      parts: [{ id: "pi1", name: "24px 세트", status: "완료" }],
      updates: [
        {
          id: "ui1",
          partId: "pi1",
          date: "2025-05-22",
          title: "48개 아이콘 납품",
          detail: "아웃라인 / 필 2스타일.",
          media: [{ type: "image", src: "images/th-10.jpg" }]
        }
      ]
    },
    {
      id: "p-banner",
      name: "시즌 배너 시리즈",
      category: "브랜딩",
      status: "진행 중",
      cover: "images/th-11.jpg",
      mediaType: "image",
      started: "2025-10-20",
      updated: "2025-11-06",
      parts: [
        { id: "pbn1", name: "가을", status: "완료" },
        { id: "pbn2", name: "겨울", status: "진행 중" }
      ],
      updates: [
        {
          id: "ubn1",
          partId: "pbn2",
          date: "2025-11-06",
          title: "겨울 배너 1안",
          detail: "눈 파티클 레이어 추가 예정.",
          media: [{ type: "image", src: "images/th-11.jpg" }]
        },
        {
          id: "ubn2",
          partId: "pbn1",
          date: "2025-10-25",
          title: "가을 배너 확정",
          detail: "승인 완료.",
          media: [{ type: "image", src: "images/th-06.jpg" }]
        }
      ]
    }
  ]
};
