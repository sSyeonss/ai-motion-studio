// data/knowledge.js
// 존코바 세미나 「AI 모션그래픽 기초 완결판」에서 정리한 지식 데이터.
// 앱 UI는 이 데이터를 읽어서 렌더링합니다. 내용을 바꾸고 싶으면 여기만 수정하세요.
// (빌드 도구 없이 동작하도록 전역 window.KNOWLEDGE에 담습니다.)

window.KNOWLEDGE = {
  // ── 작업 단계 (사이드바 1~7 단계, 작업 현황 화면) ──
  // 숙제 같은 체크리스트 대신, 단계마다 하는 일(desc)과 참고 팁(tips)만 둔다.
  steps: [
    {
      id: "plan", title: "기획", tools: ["Claude"],
      desc: "주제·목적·느낌·러닝타임과 레퍼런스로 컨셉, 방향성, 시나리오를 잡아요.",
      tips: [
        "구체적으로 쓸수록 AI 재량은 줄고 의도에 가까워져요.",
        "이미지보다 '샷'을 먼저 설계하면 뒤 단계가 편해요 (와이드·디테일·POV·메타포).",
        "2D는 AI 티가 잘 나요. AI가 잘하는 스타일인지 레퍼런스로 미리 확인해 두면 좋아요."
      ]
    },
    {
      id: "chars", title: "캐릭터 시트", tools: ["Higgsfield", "GPT 이미지", "Nano Banana"],
      desc: "기획에 맞춰 캐릭터 기준 이미지를 만들고, 3면도(정면·측면·후면)·표정·소품 디테일을 담은 시트로 일관성을 잡아요. 캐릭터가 없으면 건너뛰어도 돼요.",
      tips: [
        "기준 이미지를 Higgsfield에서도 레퍼런스로 함께 올리면 얼굴·의상이 더 정확히 유지돼요.",
        "캐릭터 시트가 있으면 영상 생성 실패 확률이 크게 줄어요.",
        "여기서 고른 시트가 다음 단계 스타일프레임에 그대로 들어가요."
      ]
    },
    {
      id: "style", title: "스타일프레임", tools: ["Higgsfield", "Midjourney", "GPT 이미지"],
      desc: "캐릭터가 등장하는 대표 컨셉 이미지로 룩·컬러·질감을 확정해요. 고른 한 장이 이후 모든 샷의 기준이 돼요.",
      tips: [
        "고른 캐릭터 시트가 레퍼런스로 함께 들어가서 캐릭터 모습이 유지돼요.",
        "Midjourney는 미감이 좋지만 글자를 못 쓰고 지시를 잘 안 따라요.",
        "마음에 드는 결과를 ★로 고르면 샷 프롬프트 초안에 자동으로 반영돼요."
      ]
    },
    {
      id: "board", title: "스토리보드", tools: ["Claude"],
      desc: "기획 시나리오로 컷별 구도 스케치와 연출 메모를 AI로 그려 보고, 컷마다 고치면서 흐름을 다듬어요.",
      tips: [
        "스케치는 구도·카메라·움직임 방향을 보는 용도예요. 그림체는 스타일프레임을 따르면 돼요.",
        "마음에 안 드는 컷은 '수정 요청'에 적고 다시 그리면 그 컷만 바뀌어요.",
        "여기서 정한 연출 메모가 샷 이미지·영상 프롬프트 초안에 그대로 반영돼요."
      ]
    },
    {
      id: "shots", title: "샷 이미지", tools: ["Higgsfield", "GPT 이미지", "Nano Banana Pro"],
      desc: "컷마다 한글로 프롬프트를 쓰고 확인한 뒤 영문화해서 Higgsfield에서 이미지를 만들어요.",
      tips: [
        "배경·소품·색상까지 처음 프롬프트에 모두 넣어 한 번에 생성하세요. 수정을 반복하면 얼룩·번짐이 쌓여요.",
        "부분 수정이 꼭 필요하면 Nano Banana Pro가 시킨 곳만 정확히 바꿔요.",
        "캐릭터 시트와 스타일프레임을 레퍼런스로 함께 넣으세요."
      ]
    },
    {
      id: "select", title: "애니메틱", tools: ["이 앱"],
      desc: "타임라인에서 컷 순서·길이·전환·카메라 무빙을 다듬고, 소스에서 마음에 드는 샷 이미지를 더 넣거나 빼요.",
      tips: [
        "앵커 이미지가 영상화의 시작 프레임이 돼요.",
        "애니메틱에서 어색한 컷은 샷 이미지 단계로 돌아가 다시 뽑으면 돼요."
      ]
    },
    {
      id: "video", title: "영상화", tools: ["Higgsfield", "Seedance", "Kling", "MiniMax"],
      desc: "앵커 이미지로 영상 프롬프트를 쓰고 영문화해서 Higgsfield에서 영상을 만들어요.",
      tips: [
        "연출 중심은 Seedance, 타이포는 MiniMax, 제품처럼 안정적인 움직임은 Kling이 잘해요.",
        "저화질(480p)로 여러 번 뽑아 고른 뒤, 확정 컷만 고화질로 다시 만들면 크레딧을 아껴요.",
        "원치 않는 변화(실루엣 등)가 나오면 그 내용을 금지 항목에 추가하세요."
      ]
    },
    {
      id: "edit", title: "편집 · AE", tools: ["After Effects"],
      desc: "채택한 영상(없으면 앵커 이미지)을 이어 붙여 최종 영상을 러프하게 확인하고, 컷별 속도·리버스·메모를 정리해 After Effects로 넘겨요.",
      tips: [
        "내보낸 패키지의 build_comp.jsx를 AE에서 실행하면 컴프·마커가 자동으로 만들어져요.",
        "사람의 편집과 사운드 디자인이 AI 티를 줄이는 가장 확실한 방법이에요.",
        "포트폴리오·방송용이면 AI 사용 표기를 잊지 마세요."
      ]
    }
  ],

  // 편집·AE 패키지 (zip 만들기용 라이브러리, 내보낼 때만 불러온다)
  editing: {
    jszipUrl: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    // 컷 선정 편집기의 카메라 무빙 (이미지 한 장으로 만드는 2D 무빙). AE 패키지에도 키프레임으로 들어간다
    moves: [
      { id: "none", ko: "고정", icon: "■" },
      { id: "push", ko: "푸시 인", icon: "⊕" },
      { id: "pull", ko: "풀 아웃", icon: "⊖" },
      { id: "panR", ko: "팬 →", icon: "→" },
      { id: "panL", ko: "팬 ←", icon: "←" },
      { id: "up", ko: "틸트 ↑", icon: "↑" },
      { id: "down", ko: "틸트 ↓", icon: "↓" },
      { id: "kenburns", ko: "켄 번스", icon: "↗" },
      { id: "handheld", ko: "핸드헬드", icon: "≈" }
    ],
    strengths: [{ v: 0.5, ko: "약" }, { v: 1, ko: "중" }, { v: 1.6, ko: "강" }],
    // 이전 컷 → 이 컷으로 들어오는 전환. 전환 시간만큼 이 컷의 앞부분과 겹친다 (전체 길이는 그대로)
    transitions: [
      { id: "cut", ko: "컷" },
      { id: "dissolve", ko: "디졸브" },
      { id: "fade", ko: "페이드" },
      { id: "wipe", ko: "와이프" },
      { id: "slide", ko: "슬라이드" },
      { id: "zoom", ko: "줌" }
    ],
    // 최종 편집 타임라인의 컷별 속도 (속도를 바꾸면 같은 영상 구간을 쓰도록 컷 길이도 맞춰진다)
    speeds: [0.25, 0.5, 0.75, 1, 1.5, 2, 3]
  },

  // 프롬프트 용어 사전 — 샷 이미지·영상화 프롬프트 옆에 띄워 클릭으로 넣는다
  // ko: 한글 칸에 넣는 말, en: 영문 칸에 넣는 말, desc: 한 줄 설명, fig: 작은 그림(앱이 그림), icon: 그림이 없을 때 글자
  // fig 종류: size(k=인물 배율, ay=화면 가운데 오는 인물 높이) · angle · move · ease
  terms: [
    {
      id: "shot", ko: "샷 · 앵글", items: [
        { ko: "익스트림 클로즈업", en: "extreme close-up", desc: "눈·손끝처럼 아주 작은 부분만 화면 가득. 감정·디테일을 강하게.", fig: { t: "size", k: 5, ay: 4.5 } },
        { ko: "클로즈업", en: "close-up", desc: "얼굴(또는 사물 하나)이 화면을 채운다. 표정과 감정 전달.", fig: { t: "size", k: 3, ay: 6 } },
        { ko: "바스트 샷", en: "medium close-up, chest up", desc: "가슴 위까지. 대화·리액션에 가장 많이 쓴다.", fig: { t: "size", k: 2.1, ay: 9 } },
        { ko: "미디엄 샷", en: "medium shot, waist up", desc: "허리 위까지. 표정과 손동작을 함께 보여 준다.", fig: { t: "size", k: 1.5, ay: 12 } },
        { ko: "풀 샷", en: "full shot, whole body in frame", desc: "인물 전신이 한 화면에. 동작·의상이 잘 보인다.", fig: { t: "size", k: 0.95, ay: 14 } },
        { ko: "와이드 샷", en: "wide shot", desc: "인물과 주변 공간을 함께. 상황·위치를 알려 준다.", fig: { t: "size", k: 0.5, ay: 14 } },
        { ko: "익스트림 와이드", en: "extreme wide shot, establishing shot", desc: "넓은 풍경 속 작은 인물. 장소를 소개하는 첫 컷.", fig: { t: "size", k: 0.24, ay: 13, horizon: true } },
        { ko: "인서트 컷", en: "insert shot of a detail", desc: "소품·글자 같은 디테일만 따로 보여 주는 짧은 컷.", icon: "◎" },
        { ko: "오버 더 숄더", en: "over-the-shoulder shot", desc: "한 사람 어깨 너머로 상대를 본다. 대화 장면의 기본.", icon: "◐" },
        { ko: "POV 샷", en: "point-of-view shot", desc: "인물이 보는 시선 그대로. 관객이 그 인물이 된다.", icon: "👁" },
        { ko: "아이 레벨", en: "eye-level angle", desc: "눈높이에서 정면으로. 가장 중립적이고 편안한 시선.", fig: { t: "angle", a: "eye" } },
        { ko: "로우 앵글", en: "low angle shot", desc: "아래에서 올려다본다. 크고 강하고 위압적으로.", fig: { t: "angle", a: "low" } },
        { ko: "하이 앵글", en: "high angle shot", desc: "위에서 내려다본다. 작고 약하거나 귀엽게.", fig: { t: "angle", a: "high" } },
        { ko: "탑 뷰", en: "top-down view, bird's-eye view", desc: "바로 위에서 수직으로. 패턴·배치·지도 같은 그림.", fig: { t: "angle", a: "top" } },
        { ko: "더치 앵글", en: "dutch angle, tilted horizon", desc: "화면을 기울인다. 불안·긴장·혼란.", fig: { t: "angle", a: "dutch" } }
      ]
    },
    {
      id: "camera", ko: "카메라 무빙", items: [
        { ko: "고정 샷", en: "static locked-off camera", desc: "카메라가 움직이지 않는다. 안정적, 피사체 움직임에 집중.", fig: { t: "move", m: "static" } },
        { ko: "푸시 인", en: "slow push-in toward the subject", desc: "피사체 쪽으로 천천히 다가간다. 몰입·긴장이 커진다.", fig: { t: "move", m: "push" } },
        { ko: "풀 아웃", en: "slow pull-back revealing the scene", desc: "뒤로 물러나며 주변을 드러낸다. 정리·여운·반전.", fig: { t: "move", m: "pull" } },
        { ko: "팬", en: "smooth horizontal pan", desc: "제자리에서 고개를 좌우로 돌린다. 공간을 훑기.", fig: { t: "move", m: "pan" } },
        { ko: "틸트", en: "vertical tilt up", desc: "제자리에서 위아래로. 높이·크기를 보여 준다.", fig: { t: "move", m: "tilt" } },
        { ko: "트래킹", en: "tracking shot following the subject", desc: "피사체 옆을 나란히 따라 이동한다.", fig: { t: "move", m: "track" } },
        { ko: "오빗", en: "orbiting camera circling the subject", desc: "피사체 주위를 빙 돈다. 입체감·영웅적 순간.", fig: { t: "move", m: "orbit" } },
        { ko: "크레인 업", en: "crane up, rising camera", desc: "카메라가 높이 솟아오른다. 웅장한 시작·마무리.", fig: { t: "move", m: "crane" } },
        { ko: "줌 인", en: "zoom in", desc: "렌즈로 확대. 다가가는 것보다 평면적이고 기계적인 느낌.", fig: { t: "move", m: "zoom" } },
        { ko: "크래시 줌", en: "fast crash zoom", desc: "아주 빠른 줌. 코믹·충격 강조.", fig: { t: "move", m: "crash" } },
        { ko: "돌리 줌", en: "dolly zoom, vertigo effect", desc: "다가가며 줌 아웃. 배경이 늘어나는 어지러운 효과.", fig: { t: "move", m: "vertigo" } },
        { ko: "핸드헬드", en: "handheld camera with subtle shake", desc: "손으로 든 듯 살짝 흔들림. 현장감·다큐 느낌.", fig: { t: "move", m: "handheld" } },
        { ko: "위프 팬", en: "whip pan transition", desc: "빠르게 휙 돌려 모션 블러로 다음 장면에 넘어간다.", fig: { t: "move", m: "whip" } },
        { ko: "랙 포커스", en: "rack focus from foreground to background", desc: "초점이 앞에서 뒤로(또는 반대로) 옮겨 간다.", fig: { t: "move", m: "rack" } }
      ]
    },
    {
      id: "direction", ko: "연출 · 구도 · 빛", items: [
        { ko: "삼분할 구도", en: "rule of thirds composition", desc: "화면을 3×3으로 나눈 선 위에 피사체를 둔다.", icon: "▦" },
        { ko: "대칭 구도", en: "perfectly symmetrical composition", desc: "좌우를 똑같이. 정돈·인공적·웨스 앤더슨 느낌.", icon: "◫" },
        { ko: "리딩 룸", en: "lead room in the direction of movement", desc: "시선·이동 방향 앞쪽을 비워 둔다.", icon: "⇥" },
        { ko: "전경 프레이밍", en: "foreground elements framing the subject", desc: "앞쪽 사물 사이로 주인공을 보이게. 깊이감.", icon: "▣" },
        { ko: "얕은 심도", en: "shallow depth of field, soft bokeh background", desc: "배경을 흐리게 날려 주인공만 또렷하게.", icon: "◉" },
        { ko: "깊은 심도", en: "deep focus, everything sharp", desc: "앞부터 뒤까지 모두 선명. 정보가 많은 화면.", icon: "≡" },
        { ko: "실루엣", en: "silhouette against a bright background", desc: "밝은 배경 앞의 검은 형태. 상징적·신비로움.", icon: "◼" },
        { ko: "역광", en: "strong backlight", desc: "피사체 뒤에서 오는 빛. 윤곽이 빛나고 분위기가 산다.", icon: "☀" },
        { ko: "림 라이트", en: "rim light outlining the subject", desc: "가장자리만 빛나게. 배경과 분리.", icon: "◌" },
        { ko: "하이키 조명", en: "high-key lighting, bright and airy", desc: "그림자 적고 밝게. 산뜻·긍정·광고 느낌.", icon: "○" },
        { ko: "로우키 조명", en: "low-key lighting, deep shadows", desc: "어둡고 대비 강하게. 드라마·미스터리.", icon: "●" },
        { ko: "골든아워", en: "golden hour warm light", desc: "해 질 녘 따뜻하고 낮은 빛.", icon: "◒" },
        { ko: "매치 컷", en: "match cut on similar shape", desc: "앞 컷과 모양·동작이 이어지게 다음 컷으로 바꾼다.", icon: "⇋" },
        { ko: "리빌", en: "reveal shot", desc: "가려져 있던 대상을 서서히 드러낸다.", icon: "◧" },
        { ko: "슬로 모션", en: "slow motion", desc: "시간을 늘려 순간을 강조.", icon: "⧗" },
        { ko: "타임랩스", en: "time-lapse", desc: "긴 시간을 빠르게 압축. 변화·흐름.", icon: "⏱" }
      ]
    },
    {
      id: "motion", ko: "모션그래픽", items: [
        { ko: "이즈 인 아웃", en: "smooth ease-in-out motion", desc: "천천히 출발해 천천히 멈춘다. 가장 기본적인 부드러운 움직임.", fig: { t: "ease", c: "inout" } },
        { ko: "이즈 아웃", en: "fast start with ease-out", desc: "빠르게 튀어나와 부드럽게 멈춘다. 등장에 좋다.", fig: { t: "ease", c: "out" } },
        { ko: "오버슈트", en: "overshoot and settle", desc: "목표를 살짝 지나쳤다가 돌아와 멈춘다. 경쾌함.", fig: { t: "ease", c: "overshoot" } },
        { ko: "바운스", en: "bouncy elastic motion", desc: "통통 튀며 멈춘다. 귀엽고 장난스럽게.", fig: { t: "ease", c: "bounce" } },
        { ko: "리니어", en: "constant linear speed", desc: "처음부터 끝까지 같은 속도. 기계적·루프용.", fig: { t: "ease", c: "linear" } },
        { ko: "스텝 애니메이션", en: "stepped animation on twos, choppy frame rate", desc: "프레임을 건너뛰듯 뚝뚝. 스톱모션·손그림 느낌.", fig: { t: "ease", c: "step" } },
        { ko: "스쿼시 앤 스트레치", en: "squash and stretch", desc: "누르면 납작, 늘어나면 길쭉. 탄력과 무게감.", icon: "⬭" },
        { ko: "예비 동작", en: "anticipation before the main action", desc: "움직이기 전 반대로 살짝 움츠린다. 동작이 또렷해진다.", icon: "↩" },
        { ko: "팔로 스루", en: "follow-through and overlapping action", desc: "멈춘 뒤에도 머리카락·꼬리가 조금 더 따라 움직인다.", icon: "〰" },
        { ko: "스태거", en: "staggered sequential animation", desc: "여러 요소가 차례로 시간차를 두고 움직인다.", icon: "⋰" },
        { ko: "모프", en: "seamless shape morph", desc: "한 모양이 다른 모양으로 매끄럽게 변한다.", icon: "◆" },
        { ko: "마스크 리빌", en: "mask reveal wipe", desc: "가림막이 걷히듯 요소가 나타난다.", icon: "◨" },
        { ko: "라인 드로잉", en: "line draws itself on, stroke animation", desc: "선이 그려지듯 따라가며 나타난다 (트림 패스).", icon: "✎" },
        { ko: "키네틱 타이포", en: "kinetic typography", desc: "글자가 리듬에 맞춰 움직이며 의미를 전한다.", icon: "T" },
        { ko: "패럴랙스", en: "parallax layers moving at different speeds", desc: "앞·뒤 레이어가 다른 속도로 움직여 깊이가 생긴다.", icon: "☰" },
        { ko: "아이들 모션", en: "subtle idle motion, breathing and blinking", desc: "멈춰 있을 때도 숨쉬기·깜빡임으로 살아 있게.", icon: "∿" },
        { ko: "심리스 루프", en: "seamless loop", desc: "끝과 처음이 이어져 끊김 없이 반복된다.", icon: "∞" }
      ]
    },
    {
      id: "design", ko: "디자인 컨셉", items: [
        { ko: "플랫 벡터", en: "flat vector illustration, clean shapes", desc: "그림자 없는 평면 도형과 단색. 깔끔한 설명형.", icon: "■" },
        { ko: "아이소메트릭", en: "isometric illustration", desc: "30° 비스듬히 본 입체 도면 스타일. 인포그래픽.", icon: "⬡" },
        { ko: "2.5D", en: "2.5D layered illustration with depth", desc: "평면 레이어에 입체감·그림자를 살짝 더한다.", icon: "◪" },
        { ko: "클레이", en: "claymation style, soft clay texture", desc: "찰흙 인형처럼 말랑하고 손맛 있는 질감.", icon: "●" },
        { ko: "페이퍼 컷아웃", en: "layered paper cut-out style", desc: "종이를 오려 겹친 듯한 층과 그림자.", icon: "▤" },
        { ko: "리소 프린트", en: "risograph print texture, misregistered colors", desc: "거친 인쇄 질감, 살짝 어긋난 색판. 레트로·인디.", icon: "▧" },
        { ko: "그레인 질감", en: "subtle film grain texture", desc: "고운 입자 노이즈. 디지털 티를 줄이고 따뜻하게.", icon: "░" },
        { ko: "하프톤", en: "halftone dot pattern", desc: "점 크기로 명암을 표현. 만화·인쇄물 느낌.", icon: "⠿" },
        { ko: "그라디언트", en: "soft vibrant gradients", desc: "부드럽게 번지는 색. 모던 테크·브랜딩.", icon: "▨" },
        { ko: "듀오톤", en: "duotone color scheme", desc: "두 가지 색만으로 강렬하게.", icon: "◑" },
        { ko: "미니멀", en: "minimalist composition, lots of negative space", desc: "요소를 줄이고 여백을 크게.", icon: "□" },
        { ko: "네온", en: "neon glow on dark background", desc: "어두운 배경에 빛나는 네온 선. 밤·사이버.", icon: "✦" },
        { ko: "Y2K", en: "Y2K aesthetic, chrome and glossy", desc: "크롬·광택·버블. 2000년대 디지털 감성.", icon: "◈" },
        { ko: "바우하우스", en: "Bauhaus geometric shapes, primary colors", desc: "원·삼각·사각과 원색. 기하학적 모던.", icon: "▲" },
        { ko: "셀 셰이딩", en: "cel-shaded, flat anime shading", desc: "애니처럼 경계가 딱 떨어지는 명암.", icon: "◭" },
        { ko: "수채화", en: "watercolor texture, soft bleeding edges", desc: "번지는 물감 가장자리, 종이 질감.", icon: "≈" },
        { ko: "파스텔 팔레트", en: "soft pastel color palette", desc: "채도 낮은 부드러운 색. 다정하고 가볍게.", icon: "◌" },
        { ko: "고대비", en: "bold high-contrast colors", desc: "강한 명암·보색 대비. 눈에 확 띄게.", icon: "◐" }
      ]
    },
    {
      id: "material", ko: "재질 · 질감", items: [
        { ko: "무광 플라스틱", en: "matte plastic material", desc: "반사 없이 보송한 플라스틱. 장난감·제품 렌더.", icon: "▢" },
        { ko: "유광 플라스틱", en: "glossy plastic with soft reflections", desc: "매끈하고 반짝이는 표면. 팝하고 귀엽게.", icon: "◍" },
        { ko: "유리", en: "clear glass, refraction and caustics", desc: "투명하고 빛이 굴절된다. 고급·청량.", icon: "◇" },
        { ko: "프로스티드 글라스", en: "frosted glass, soft blur behind", desc: "뿌옇게 비치는 반투명 유리. 모던 UI·테크.", icon: "▭" },
        { ko: "크롬 금속", en: "polished chrome metal, mirror reflections", desc: "거울처럼 비치는 금속. Y2K·미래적.", icon: "◈" },
        { ko: "브러시드 메탈", en: "brushed aluminum texture", desc: "결이 보이는 무광 금속. 제품·하드웨어.", icon: "▥" },
        { ko: "골드", en: "shiny gold metallic finish", desc: "금빛 광택. 고급·축하.", icon: "✧" },
        { ko: "벨벳 · 패브릭", en: "soft velvet fabric texture", desc: "부드러운 섬유 결. 따뜻하고 촉감적.", icon: "▒" },
        { ko: "니트 · 털실", en: "knitted yarn texture", desc: "뜨개질 실 질감. 포근·핸드메이드.", icon: "⌇" },
        { ko: "고무 · 실리콘", en: "soft rubbery silicone material", desc: "말랑하고 탄력 있는 표면. 귀여운 3D.", icon: "⬬" },
        { ko: "나무", en: "natural wood grain", desc: "나뭇결. 자연·친환경·따뜻함.", icon: "≋" },
        { ko: "대리석", en: "polished marble surface", desc: "결무늬 돌. 럭셔리·미니멀.", icon: "◊" },
        { ko: "콘크리트", en: "raw concrete texture", desc: "거친 회색 시멘트. 도시·브루탈.", icon: "▩" },
        { ko: "종이 · 판지", en: "paper and cardboard texture", desc: "섬유 결이 보이는 종이. 핸드메이드·친근.", icon: "▤" },
        { ko: "젤리 · 반투명", en: "translucent jelly material, subsurface scattering", desc: "빛이 스며드는 말랑한 반투명. 달콤·귀엽게.", icon: "◐" },
        { ko: "홀로그램 · 이리데선트", en: "iridescent holographic surface", desc: "보는 각도에 따라 무지갯빛. 트렌디·Y2K.", icon: "✺" }
      ]
    },
    {
      id: "effect", ko: "효과", items: [
        { ko: "글로우", en: "soft glow, bloom", desc: "밝은 부분이 은은하게 번져 빛난다.", icon: "✹" },
        { ko: "렌즈 플레어", en: "anamorphic lens flare", desc: "강한 빛이 렌즈에 맺힌 줄·원. 영화적.", icon: "⊹" },
        { ko: "빛줄기", en: "volumetric light rays, god rays", desc: "공기 중에 보이는 빛의 기둥. 신비·웅장.", icon: "⫽" },
        { ko: "모션 블러", en: "motion blur", desc: "빠른 움직임이 흐르듯 번진다. 속도감.", icon: "⇶" },
        { ko: "색수차", en: "chromatic aberration", desc: "가장자리에 RGB가 어긋난 테두리. 레트로·글리치.", icon: "◫" },
        { ko: "글리치", en: "digital glitch effect", desc: "화면이 깨지고 밀리는 디지털 오류 느낌.", icon: "⌁" },
        { ko: "파티클", en: "floating particles", desc: "작은 입자·먼지·반짝이가 떠다닌다.", icon: "∴" },
        { ko: "보케", en: "bokeh light orbs", desc: "흐릿한 동그란 빛망울. 감성·축제.", icon: "⁘" },
        { ko: "안개 · 연기", en: "soft haze and smoke", desc: "공기에 깔린 안개. 깊이·몽환.", icon: "☁" },
        { ko: "물방울 · 스플래시", en: "liquid splash, droplets", desc: "튀는 액체와 물방울. 음료·청량.", icon: "💧" },
        { ko: "잉크 번짐", en: "ink diffusing in water", desc: "물속에 퍼지는 잉크. 전환·예술적.", icon: "≈" },
        { ko: "필름 번", en: "film burn light leak", desc: "필름이 타는 듯한 주황빛 번짐. 빈티지 전환.", icon: "☲" },
        { ko: "비네팅", en: "subtle vignette", desc: "가장자리를 어둡게 해 시선을 가운데로.", icon: "◎" },
        { ko: "VHS", en: "VHS tape artifacts, scanlines", desc: "비디오테이프 노이즈·주사선. 90년대 레트로.", icon: "▭" },
        { ko: "드롭 섀도", en: "soft drop shadow", desc: "요소 아래 부드러운 그림자. 떠 있는 느낌.", icon: "▪" }
      ]
    }
  ],
  // 용어 사전에 '내 용어'를 AI로 만들 때 (사용자 요청 → 분류·한글·영문·설명)
  termMaker: [
    "당신은 AI 이미지·영상 프롬프트용 용어 사전을 만드는 모션그래픽 디자이너입니다.",
    "사용자가 넣고 싶은 용어(또는 원하는 느낌·'~ 키워드 몇 개 더' 같은 요청)를 받아 용어 사전 항목을 만듭니다.",
    "- ko: 한국 디자이너가 실제로 부르는 짧은 이름 (2~10자).",
    "- en: 이미지·영상 생성 프롬프트에 그대로 넣을 영어 표현 (2~8단어, 효과가 잘 나는 표현).",
    "- desc: 어떤 느낌·언제 쓰는지 한 문장 (30자 안팎).",
    "- icon: 느낌을 나타내는 유니코드 기호나 이모지 한 글자.",
    "- cat: 주어진 분류 id 중 가장 알맞은 것. 맞는 게 없으면 'mine'.",
    "- 이미 있는 용어와 겹치면 빼고, 요청이 하나면 1개, 여러 개를 원하면 요청한 수만큼 (최대 8개)."
  ].join("\n"),

  // 기획 레퍼런스의 쓰임 — 이미지마다 고른다. AI 에게 어떻게 참고할지 알려 준다
  refRoles: [
    { id: "style", ko: "스타일", icon: "🎨", desc: "화풍·색감·질감·빛만 참고 (내용은 안 가져옴)", en: "style reference only: take rendering style, color mood, texture, lighting and atmosphere; do NOT copy its characters, objects, layout, text or logos" },
    { id: "subject", ko: "등장 대상", icon: "📦", desc: "제품·로고·사물·장소를 이 모습 그대로 등장", en: "subject reference: this product/object/logo/place must appear exactly as shown (shape, colors, details); restyle it only to match the scene's rendering style" },
    { id: "layout", ko: "구도·연출", icon: "📐", desc: "화면 구성·카메라·움직임만 참고", en: "composition reference only: follow its framing, layout and camera angle; do NOT copy its content or style" }
  ],

  // 스타일 레퍼런스 분석 (기획 화면) — 키워드 + 고를 수 있는 스타일 방향
  styleAnalysis: [
    "당신은 모션그래픽 아트 디렉터입니다. 첨부한 스타일 레퍼런스들의 공통 스타일을 '짧고 핵심만' 정리합니다.",
    "- summary: 한 문장, 40자 안팎 (화풍·질감·색 중심). 그림 속 내용은 말하지 않는다.",
    "- keywords: 핵심 스타일 키워드 5~8개. cat 은 화풍/재질/색/빛/효과/구도/분위기 중 하나. ko 는 2~8자 디자인 용어, en 은 프롬프트용 영어.",
    "- options: 이 작품에 쓸 스타일 방향 3개 — 1번 레퍼런스에 충실, 2번 브리프(주제·목적·느낌)에 맞춤, 3번 과감한 변주.",
    "  각 option: name(2~8자), desc(20자 안팎 한 줄), look(기획안 '룩'에 넣을 1~2문장), palette(4~5색 hex), keywords(핵심 3개, ko).",
    "- recommend: 브리프에 가장 잘 맞는 방향 번호(1~3), reason: 그 이유 한 줄(25자 안팎).",
    "- AI 이미지·영상 모델로 일관되게 만들기 쉬운 표현을 고른다. 길게 설명하지 않는다."
  ].join("\n"),


  // 샷 이미지·영상화 화면에 보이는 컷 요약 — 긴 컷 설명에서 화면에 꼭 보여야 할 핵심만
  cutBrief: {
    system: [
      "당신은 모션그래픽 감독의 조수입니다. 컷 설명을 읽고, 이미지·영상 프롬프트를 쓸 때 놓치면 안 되는 핵심만 아주 짧게 요약합니다.",
      "- title: 컷의 이름. 2~10자 명사구 (예: '해 뜨는 창가').",
      "- points: 화면에 반드시 보여야 할 것 2~3개. 각 4~16자, 주어·조사 없이 짧게 (예: '노란 해가 천천히 떠오름', '크림색 배경').",
      "- 피사체·핵심 동작·분위기(또는 구도) 순서로. 꾸밈말, 설명, 반복은 빼고 원문에 없는 내용은 만들지 않는다.",
      "- 입력의 id 를 그대로 돌려준다."
    ].join("\n")
  },

  // Higgsfield — 웹 페이지(직접 만들 때) + 연결 프로그램으로 자동 생성할 때의 기본값
  higgsfield: {
    image: "https://higgsfield.ai/ai-image",
    video: "https://higgsfield.ai/create/video",
    // 단계별 기본 모델 (영상은 컷마다 따로 고를 수도 있다)
    defaults: { models: { style: "gpt_image_2_5", chars: "gpt_image_2_5", shots: "nano_banana_pro", video: "seedance_2_5" }, useUnlim: false, tiers: {} },
    // 모델 카탈로그 (Higgsfield models_explore 조회 결과로 정리, 2026-10-27)
    //  unlim: 무제한(체험) 생성을 받는 모델 — 이 표시가 없는 모델에 무제한을 요청하면 Higgsfield 가 거절한다
    //  role: 레퍼런스 역할 이름 / tier: 화질 옵션 [파라미터 이름, 선택지…] (첫 값이 기본·저렴)
    //  duration: 영상 길이 [최소, 최대] 또는 { options: […] } / audioOff: 오디오 끄는 파라미터 / fixed: 항상 넣을 값
    //  end: 엔드 프레임(end_image)을 받는 영상 모델 — 시작·끝 프레임 사이를 이어서 만든다
    imageModels: [
      { id: "gpt_image_2_5", name: "GPT Image 2.5", note: "범용 · 레퍼런스 편집 · 글자", role: "image_references", tier: ["quality", "low", "medium", "high", "xhigh"] },
      { id: "nano_banana_pro", unlim: true, name: "Nano Banana Pro", note: "최고 품질 · 시킨 것만 정확히", role: "image_references", tier: ["resolution", "1k", "2k", "4k"] },
      { id: "nano_banana_2", unlim: true, name: "Nano Banana 2", note: "빠르고 좋은 품질", role: "image_references", tier: ["resolution", "1k", "2k", "4k"] },
      { id: "seedream_v5_pro", unlim: true, name: "Seedream 5.0 Pro", note: "지시 기반 편집 · 2K", role: "image_references", tier: ["resolution", "1k", "1.5k", "2k"] },
      { id: "seedream_v4_5", unlim: true, name: "Seedream 4.5", note: "4K · 정밀 제어", role: "image_references", tier: ["quality", "basic", "high"] },
      { id: "flux_2", unlim: true, name: "FLUX.2", note: "프롬프트 충실 · 크리에이티브", role: "image_references", tier: ["resolution", "1k", "2k"] },
      { id: "kling_omni_image", unlim: true, name: "Kling O1 Image", note: "사실적 · 와이드 비율", role: "image_references", tier: ["resolution", "1k", "2k"] },
      { id: "ideogram_4_5", name: "Ideogram 4.5", note: "타이포그래피", role: "image_references", tier: ["quality", "low", "medium", "high"] },
      { id: "gpt_image_2", unlim: true, name: "GPT Image 2", note: "글자 · 편집", role: "image", tier: ["quality", "low", "medium", "high"] },
      { id: "soul_cinematic", name: "Soul Cinema", note: "영화 같은 스틸 · 컨셉아트 (레퍼런스 1장)", role: "image", maxRefs: 1, tier: ["quality", "1.5k", "2k"] },
      { id: "soul_2", unlim: true, name: "Soul 2.0", note: "인물 · 패션 (레퍼런스 1장)", role: "image", maxRefs: 1, tier: ["quality", "1.5k", "2k"] },
      { id: "cinematic_studio_2_5", name: "Cinema Studio Image 2.5", note: "시네마틱 스틸 · 4K", role: "image", tier: ["resolution", "1k", "2k", "4k"] },
      { id: "image_auto", name: "Auto", note: "Higgsfield가 알아서 모델 선택", role: "image" },
      // 내 API 키로 바로 만드는 모델 (api: 키 종류, apiModel: 그 플랫폼의 모델 이름 — AI 연결 설정에서 바꿀 수 있다)
      { id: "openai_api_image", api: "openai", apiModel: "gpt-image-1", name: "GPT Image (내 OpenAI 키)", note: "OpenAI API 키로 직접 · 레퍼런스 편집", maxRefs: 16, tier: ["quality", "medium", "low", "high"] },
      { id: "gemini_api_image", api: "gemini", apiModel: "gemini-2.5-flash-image", name: "Nano Banana (내 Gemini 키)", note: "Google AI Studio 키로 직접", maxRefs: 3 },
      // 자동 연결이 없는 곳: 프롬프트 복사 + 레퍼런스 저장 + 웹 열기 (결과는 Ctrl+V 로 붙여넣기) — 각자 쓰는 구독 사이트
      { id: "midjourney", name: "Midjourney", note: "웹에서 직접 (Higgsfield에 없음)", web: "https://www.midjourney.com/imagine" },
      { id: "chatgpt_web", name: "ChatGPT (웹)", note: "내 ChatGPT 구독 · 웹에서 직접", web: "https://chatgpt.com/" },
      { id: "gemini_web", name: "Gemini (웹)", note: "내 Gemini 구독 · 웹에서 직접", web: "https://gemini.google.com/app" },
      { id: "higgsfield_web_image", name: "Higgsfield (웹)", note: "내 Higgsfield 계정 · 웹에서 직접", web: "https://higgsfield.ai/ai-image" }
    ],
    videoModels: [
      { id: "seedance_2_5", end: true, name: "Seedance 2.5", note: "연출 · 범용 (4~30초)", role: "start_image", tier: ["resolution", "480p", "720p", "1080p"], duration: [4, 30], audioOff: { generate_audio: false }, fixed: { mode: "omni_reference" } },
      { id: "seedance_2_0", end: true, unlim: true, name: "Seedance 2.0", note: "캐릭터 일관성 (4~15초)", role: "start_image", tier: ["resolution", "480p", "720p", "1080p"], duration: [4, 15], audioOff: { generate_audio: false } },
      { id: "seedance_2_0_mini", end: true, unlim: true, name: "Seedance 2.0 Mini", note: "빠르고 저렴 (4~15초)", role: "start_image", tier: ["resolution", "480p", "720p"], duration: [4, 15], audioOff: { generate_audio: false } },
      { id: "kling3_0", end: true, unlim: true, name: "Kling 3.0", note: "안정적인 움직임 · 제품 (3~15초)", role: "start_image", tier: ["mode", "std", "pro"], duration: [3, 15], audioOff: { sound: "off" } },
      { id: "kling3_0_turbo", name: "Kling 3.0 Turbo", note: "빠르고 저렴 (3~15초)", role: "start_image", tier: ["resolution", "720p", "1080p"], duration: [3, 15] },
      { id: "kling4_0", end: true, name: "Kling 4.0", note: "최신 · 키프레임 (3~30초)", role: "start_image", tier: ["resolution", "720p", "1080p"], duration: [3, 30], fixed: { mode: "image-to-video" } },
      { id: "minimax_h3", end: true, name: "MiniMax H3", note: "2K · 키프레임 (4~15초)", role: "start_image", duration: [4, 15] },
      { id: "minimax_hailuo", end: true, name: "MiniMax Hailuo", note: "자연스러운 물리 · 표정 (6/10초)", role: "start_image", tier: ["resolution", "768", "1080"], duration: { options: [6, 10] } },
      { id: "cinematic_studio_3_0", end: true, name: "Cinema Studio 3.0", note: "최고급 시네마틱 (4~15초)", role: "start_image", tier: ["resolution", "480p", "720p", "1080p"], duration: [4, 15], audioOff: { generate_audio: false } },
      { id: "cinematic_studio_video_4_0", end: true, name: "Cinema Studio 4.0", note: "감독 컨트롤 (4~30초)", role: "start_image", tier: ["resolution", "480p", "720p", "1080p"], duration: [4, 30], audioOff: { generate_audio: false }, fixed: { mode: "omni_reference" } },
      { id: "grok_video_v15_lite", name: "Grok Video 1.5 Lite", note: "빠름 (1~15초)", role: "start_image", tier: ["resolution", "480p", "720p", "1080p"], duration: [1, 15] },
      { id: "happy_horse_video", name: "Happy Horse", note: "시작 프레임 애니메이션 (3~15초)", role: "start_image", tier: ["resolution", "720p", "1080p"], duration: [3, 15] },
      // 웹에서 직접 (프롬프트 복사 + 시작 프레임 저장 + 사이트 열기)
      { id: "higgsfield_web_video", name: "Higgsfield (웹)", note: "내 Higgsfield 계정 · 웹에서 직접", web: "https://higgsfield.ai/create/video" },
      { id: "kling_web", name: "Kling (웹)", note: "내 Kling 계정 · 웹에서 직접", web: "https://app.klingai.com/global/image-to-video" },
      { id: "sora_web", name: "Sora (웹)", note: "내 ChatGPT 구독 · 웹에서 직접", web: "https://sora.chatgpt.com/" },
      { id: "gemini_veo_web", name: "Gemini Veo (웹)", note: "내 Gemini 구독 · 웹에서 직접", web: "https://gemini.google.com/app" }
    ]
  },

  // ── AI 연결: 쓰는 사람마다 자기 계정으로 ─────────────
  // 글 작업(기획·스토리보드·프롬프트)을 맡길 곳. bridge = 연결 프로그램(start.cmd)이 이 PC 의 로그인된 구독을 쓴다, key = 브라우저에 넣은 내 API 키
  providers: {
    text: [
      { id: "claude-cli", name: "Claude", via: "구독 · Claude Code", bridge: "claude", setup: "Claude Code를 설치하고 로그인하세요.", link: "https://claude.com/claude-code" },
      { id: "codex-cli", name: "ChatGPT", via: "구독 · Codex CLI", bridge: "codex", setup: "터미널에서 npm i -g @openai/codex → codex login (ChatGPT 계정으로)", link: "https://developers.openai.com/codex/cli" },
      { id: "gemini-cli", name: "Gemini", via: "구글 계정 · Gemini CLI", bridge: "gemini", beta: true, setup: "터미널에서 npm i -g @google/gemini-cli → gemini 를 한 번 실행해 로그인", link: "https://github.com/google-gemini/gemini-cli" },
      { id: "claude-api", name: "Claude", via: "API 키", key: "anthropic", model: "claude-opus-5-5" },
      { id: "openai-api", name: "ChatGPT", via: "API 키", key: "openai", model: "gpt-5" },
      { id: "gemini-api", name: "Gemini", via: "API 키", key: "gemini", model: "gemini-2.5-pro" }
    ],
    // API 키 — 이 브라우저에만 저장 (백업 파일에도 안 들어감)
    keys: {
      anthropic: { name: "Claude (Anthropic)", placeholder: "sk-ant-...", link: "https://console.anthropic.com/settings/keys" },
      openai: { name: "OpenAI", placeholder: "sk-...", link: "https://platform.openai.com/api-keys" },
      gemini: { name: "Gemini (Google AI Studio)", placeholder: "AIza...", link: "https://aistudio.google.com/apikey" }
    }
  },

  // 단계별 AI 프롬프트 초안·영문화 지시문 (docs/PROMPT_RULES.md 를 따른다)
  prompting: {
    rules: [
      "프롬프트 작성 규칙:",
      "- 요소별로 쓴다: 피사체, 배경/환경, 화면 배치, 카메라·렌즈·샷, 빛, 컬러 팔레트, 스타일.",
      "- 반드시 유지할 것(필수)과 하지 말 것(금지)을 따로 적는다.",
      "- 배경·소품·색상까지 한 번에 생성되도록 조건을 처음부터 모두 넣는다.",
      "- 로우 앵글, 아이레벨, 마이크로샷, 푸시 인, 매치컷 같은 영상 문법 용어를 쓴다.",
      "- 기획의 컬러 팔레트와 스타일프레임의 룩을 모든 컷에서 일관되게 유지한다.",
      "- 캐릭터는 '@이름'(예: @모모)으로 부른다. 생성할 때 그 캐릭터 시트가 레퍼런스로 붙으니 외형을 길게 다시 묘사하지 않는다."
    ].join("\n"),
    style: "당신은 모션그래픽 아트 디렉터입니다. 기획과 레퍼런스를 바탕으로 작품 전체의 룩을 정할 '스타일프레임(컨셉 이미지)' 한 장을 위한 이미지 생성 프롬프트를 한국어로 씁니다. 작품을 대표하는 장면 하나를 골라 룩·질감·조명·팔레트가 분명히 드러나게 합니다. 캐릭터 시트가 첨부되면 그 캐릭터를 디자인 그대로(얼굴·색·의상·비율) 장면에 등장시키고, 캐릭터 시트의 레이아웃(3면도 배열)은 따라 하지 않습니다.",
    character: [
      "당신은 캐릭터 디자이너입니다. 주어진 캐릭터의 '캐릭터 시트' 한 장을 만드는 이미지 생성 프롬프트를 한국어로 씁니다.",
      "기준 이미지가 첨부되면 그 캐릭터의 얼굴·체형·의상·색·비율을 정확히 읽어 그대로 유지하게 합니다 (새로 디자인하지 않는다).",
      "시트 구성(레이아웃을 명시):",
      "- 윗줄: 정면·측면·후면 전신 3면도, 같은 크기·같은 높이로 나란히 (턴어라운드).",
      "- 가운데 줄: 요청한 표정들의 얼굴 클로즈업 (표정 디테일).",
      "- 아랫줄: 요청한 소품의 디테일 컷 (형태·재질·색이 보이게).",
      "단색 밝은 배경, 균일한 조명, 스타일프레임과 같은 화풍. 의상·색·비율 등 일관성에 필요한 특징을 구체적으로 적고, 포즈 변형·배경 소품 추가는 금지 항목에 넣습니다."
    ].join("\n"),
    characterBase: [
      "You write an English image-generation prompt for a CHARACTER REFERENCE image (the base design later turned into a character sheet).",
      "Design the character so it belongs in the project: follow the concept, palette (use the hex colors), look and target audience from the project context.",
      "If a style frame image is attached, match its rendering style exactly: line quality, shading, texture/grain, proportions, color treatment. Describe that style concretely instead of naming it vaguely.",
      "Output: one character only, full body head to toe, front three-quarter view, neutral standing pose with a little personality, plain light-gray background, even soft lighting, centered with margin.",
      "Spell out the character's defining features (silhouette, face, colors, materials, outfit, props) so they can be kept identical later.",
      "End with a line starting 'Avoid:' listing: other characters, scenery, text, cropped limbs, style drift from the style frame."
    ].join("\n"),
    storyboard: [
      "당신은 모션그래픽 스토리보드 아티스트입니다. 컷마다 (1) 구도 스케치 SVG 와 (2) 연출 메모를 만듭니다.",
      "SVG 규칙:",
      "- <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"...\"> 로 시작하고, viewBox 는 주어진 화면 비율을 따른다 (16:9 → 0 0 160 90, 9:16 → 0 0 90 160, 1:1 → 0 0 120 120).",
      "- 흰 배경 위 회색·검정 선 위주의 러프한 콘티. 피사체 형태, 배경의 큰 덩어리, 지평선·소실선으로 구도와 샷 크기가 보이게 한다.",
      "- 카메라 움직임이나 피사체 움직임은 빨간(#e5484d) 화살표로 표시한다.",
      "- 글자는 넣지 않는다. script, 외부 이미지, foreignObject, 폰트 참조 금지. 컷 하나당 4KB 이하.",
      "연출 메모는 한국어로 짧게: action(화면에서 일어나는 일), camera(샷 크기·앵글·움직임), sound(소리), transition(다음 컷으로 넘어가는 방식)."
    ].join("\n"),
    shotImage: "당신은 모션그래픽 디렉터입니다. 각 컷의 '샷 이미지'(영상화의 시작 프레임이 될 정지 이미지) 생성 프롬프트를 한국어로 씁니다. 컷의 연출 의도와 샷 종류가 화면 구도에 드러나게 하고, 스타일프레임·캐릭터 시트와 같은 화풍을 유지합니다.",
    shotVideo: "당신은 모션그래픽 애니메이터입니다. 앵커 이미지(시작 프레임)를 움직이게 할 이미지 투 비디오 프롬프트를 한국어로 씁니다. 컷 길이 안에서 일어나는 움직임을 시간 순서로, 카메라 움직임과 함께 씁니다. 준비 동작·과장·후속 동작 같은 애니메이션 원칙을 명시하고, 캐릭터가 있으면 동작 후에도 숨쉬기·눈 깜빡임 같은 미세한 움직임을 유지하게 합니다. 화면에 없는 요소를 새로 등장시키지 말고, 스타일이 바뀌지 않게 금지 항목을 넣습니다.",
    // 프롬프트 카드의 'AI에게 고칠 점' — 지금 프롬프트를 요청대로 고쳐 쓴다
    edit: "사용자의 수정 요청대로 지금 프롬프트를 고쳐 씁니다. 요청과 관계없는 내용·디테일·금지 항목은 그대로 두고, 요청한 부분만 분명하게 바꿉니다. 결과는 한국어 프롬프트 하나입니다.",
    editPresets: {
      image: ["더 구체적으로", "카메라를 더 가까이", "빛·분위기를 더 극적으로", "배경을 단순하게"],
      video: ["움직임을 더 크게", "더 느리고 부드럽게", "카메라 무빙 추가", "마지막 장면을 강조"]
    },
    translate: "You translate Korean prompts for AI image/video generation models into natural, concise English prompts. Keep every instruction and its structure (subject, environment, composition, camera, lighting, palette, style, motion). Keep hex colors and camera terms. Write must-keep items as plain instructions and forbidden items in a final line starting with 'Avoid:'. Do not add new content. Keep character mentions written as '@name' (e.g. @모모) exactly as they are — do not translate or romanize them."
  },

  // (이전 버전 워크플로우 데이터 — 생성 로그의 옛 단계 이름 표시용)
  legacySteps: [
    {
      id: "plan",
      title: "기획",
      tools: ["GPT", "Claude"],
      goal: "컨셉·길이·톤을 정하고 레퍼런스를 모은다. 이미지보다 '샷'을 먼저 설계.",
      checklist: [
        "영상 길이와 비율(16:9 등) 결정",
        "레퍼런스 이미지/영상 수집",
        "샷 구성 초안 (와이드·미디엄·디테일·POV·메타포)",
        "AI가 잘하는 스타일인지 확인 (2D는 AI 티가 잘 남)"
      ],
      tips: ["구체적으로 쓸수록 AI 재량은 줄고 의도에 가까워진다."]
    },
    {
      id: "look",
      title: "룩 탐색",
      tools: ["Midjourney"],
      goal: "미감·컬러·분위기 컨셉 이미지를 뽑는다.",
      checklist: ["컬러 팔레트 확정", "스타일 키워드 정리", "마음에 드는 룩을 레퍼런스로 저장"],
      tips: ["Midjourney는 미감은 최고지만 글자를 못 쓰고 지시를 잘 안 따른다."]
    },
    {
      id: "anchor",
      title: "앵커 이미지",
      tools: ["GPT 이미지", "Photoshop"],
      goal: "모든 조건을 한 프롬프트에 몰아서 기준 이미지를 한 번에 만든다.",
      checklist: [
        "포즈 레퍼런스 → 포토샵 '가장자리 찾기'로 라인 드로잉 변환",
        "라인 드로잉 + 캐릭터 이미지 함께 입력",
        "배경·소품·색상 등 조건을 한 번에 기입",
        "잘 나온 결과를 ⭐앵커로 저장"
      ],
      tips: ["수정을 여러 번 거칠수록 열화(얼룩·점 번짐)가 누적된다."]
    },
    {
      id: "edit",
      title: "부분 수정",
      tools: ["Nano Banana Pro"],
      goal: "꼭 필요한 부분만 정확히 수정한다.",
      checklist: ["수정 범위를 한 문장으로 명확히", "수정 횟수 최소화"],
      tips: ["가능하면 3단계(앵커)에서 미리 조건으로 넣어 이 단계를 건너뛰기."]
    },
    {
      id: "sheet",
      title: "캐릭터 시트",
      tools: ["GPT 이미지", "Nano Banana"],
      goal: "3면도(정면·측면·후면)로 일관성을 확보한다.",
      checklist: ["정면/측면/후면", "표정·소품 변형 (필요시)"],
      tips: ["캐릭터 시트가 있으면 영상 생성 실패 확률이 크게 줄어든다."]
    },
    {
      id: "script",
      title: "샷 스크립트",
      tools: ["GPT", "Claude"],
      goal: "연출 메모를 LLM으로 샷별 프롬프트로 만들고 직접 검수한다.",
      checklist: [
        "연출 메모 작성 (준비 동작·긴장과 이완 등)",
        "LLM이 쓴 프롬프트를 직접 읽고 검수",
        "영상 길이에 맞는 컷 수인지 확인",
        "영어로 변환"
      ],
      tips: ["5초 ≈ 2컷, 10초 ≈ 6~7컷. 컷이 너무 많으면 엉망으로 나온다."]
    },
    {
      id: "draft",
      title: "저화질 영상 생성",
      tools: ["Seedance", "MiniMax", "Kling"],
      goal: "480p로 여러 번 뽑아 좋은 컷을 고른다.",
      checklist: ["모델 선택 (연출=Seedance, 타이포=MiniMax, 제품=Kling)", "480p / 비율 설정", "생성 로그 기록"],
      tips: ["실루엣 등 원치 않는 변화가 나오면 네거티브에 추가."]
    },
    {
      id: "animatic",
      title: "애니메틱",
      tools: ["Premiere", "CapCut", "After Effects"],
      goal: "저화질 컷으로 미리 편집해 타이밍을 확인한다.",
      checklist: ["컷 순서 배치", "타이밍·길이 확인", "다시 뽑을 컷 표시"],
      tips: ["익숙한 편집 툴 아무거나 OK."]
    },
    {
      id: "final",
      title: "고화질",
      tools: ["영상 모델", "업스케일러"],
      goal: "확정된 컷만 고화질로 재생성하거나 업스케일한다.",
      checklist: ["확정 컷 목록", "재생성 vs 업스케일 결정", "애니메틱의 컷 교체"],
      tips: ["크레딧은 여기서만 크게 쓴다."]
    },
    {
      id: "post",
      title: "후반 작업",
      tools: ["Premiere", "Artlist"],
      goal: "편집·색보정·사운드 디자인으로 AI 티를 줄이고 내 스타일을 입힌다.",
      checklist: ["컷 편집", "색보정", "사운드 디자인 / 효과음", "AI 사용 표기 (포트폴리오·방송)"],
      tips: ["사람의 편집과 사운드가 가장 확실한 차별점."]
    }
  ],

  // ── 툴 가이드 ────────────────────────────────────
  tools: [
    { name: "GPT / Claude", category: "LLM", use: "기획, 프롬프트·샷 스크립트 작성", note: "대충 말해도 빈칸을 채워준다." },
    { name: "Midjourney", category: "이미지", use: "룩·컨셉 탐색", note: "미감 최고, 글자 못 씀, 지시를 잘 안 따름." },
    { name: "GPT 이미지", category: "이미지", use: "복잡한 지시, 텍스트 포함 이미지, 합성", note: "한글·영문 텍스트 표현이 좋음. 수정 시 다른 곳도 바꾸는 경향." },
    { name: "Nano Banana Pro", category: "이미지", use: "부분 수정", note: "시킨 것만 정확히 바꿈. 미감은 약함." },
    { name: "Seedream", category: "이미지", use: "실사·인물·화장품", note: "화사하고 예쁘게 보정되는 경향." },
    { name: "Seedance 2.5", category: "영상", use: "캐릭터·영화적 연출", note: "최대 30초, 오디오·레퍼런스 이해. 가장 비쌈." },
    { name: "MiniMax", category: "영상", use: "키네틱 타이포그래피", note: "텍스트 표현이 좋음." },
    { name: "Kling", category: "영상", use: "제품 등 안정적 움직임", note: "저렴. 시작/끝 프레임 지정." },
    { name: "Higgsfield / 뉴테이크", category: "플랫폼", use: "여러 모델을 한 곳에서", note: "뉴테이크는 노드 방식. 입문자는 Higgsfield 추천." },
    { name: "Premiere / CapCut", category: "편집", use: "애니메틱, 최종 편집, 색보정", note: "" },
    { name: "Artlist", category: "사운드", use: "음악·효과음", note: "" }
  ],

  // ── 카메라/샷 용어 ───────────────────────────────
  shots: [
    { term: "Low angle", ko: "로우 앵글", desc: "아래에서 올려다보는 구도. 웅장함·위압감." },
    { term: "Eye level", ko: "아이레벨", desc: "눈높이 정면. 윗면·아랫면이 보이지 않음." },
    { term: "Dutch angle", ko: "더치 앵글", desc: "화면을 기울인 사선 구도. 불안·긴장." },
    { term: "Micro shot", ko: "마이크로샷", desc: "현미경처럼 아주 세밀한 확대 샷." },
    { term: "Metaphor shot", ko: "메타포샷", desc: "주제를 은유적으로 표현 (예: 출발하는 말 ↔ 페라리)." },
    { term: "Bullet time", ko: "불릿타임", desc: "슬로우모션 중 카메라가 360도로 회전." },
    { term: "POV", ko: "1인칭 시점", desc: "인물의 시점으로 보는 샷." },
    { term: "Wide / Medium / Detail", ko: "와이드 / 미디엄 / 디테일", desc: "피사체와의 거리에 따른 샷 크기." },
    { term: "Push in / Push out", ko: "푸시 인 / 아웃", desc: "카메라가 다가가거나 멀어짐." },
    { term: "Follow", ko: "팔로우", desc: "피사체를 따라가는 카메라." },
    { term: "One-point perspective", ko: "원포인트 퍼스펙티브", desc: "소실점이 하나인 투시." },
    { term: "Match cut", ko: "매치컷", desc: "모양·동작이 닮은 두 장면을 이어 붙이는 전환." },
    { term: "Tension & release", ko: "긴장과 이완", desc: "긴장을 고조시켰다가 한 번에 터뜨리는 연출." }
  ],

  // ── 애니메이션 12원칙 ────────────────────────────
  principles: [
    { en: "Squash and stretch", ko: "스쿼시 앤 스트레치", desc: "늘어났다 줄어드는 말랑함.", star: true },
    { en: "Anticipation", ko: "준비 동작", desc: "본 동작 전의 예비 동작.", star: true },
    { en: "Staging", ko: "연출", desc: "의도가 분명히 보이게 배치." },
    { en: "Straight ahead & pose to pose", ko: "스트레이트 어헤드 / 포즈 투 포즈", desc: "작화 방식." },
    { en: "Follow through & overlapping action", ko: "후속 동작 / 중첩 동작", desc: "멈춘 뒤에도 따라 움직이는 부분." },
    { en: "Slow in & slow out", ko: "가속·감속", desc: "시작과 끝을 부드럽게." },
    { en: "Arcs", ko: "호", desc: "자연스러운 곡선 궤적." },
    { en: "Secondary action", ko: "부차 동작", desc: "주 동작을 보조하는 동작." },
    { en: "Timing", ko: "타이밍", desc: "프레임 수로 무게·속도 표현." },
    { en: "Exaggeration", ko: "과장", desc: "동작을 강조해 더 생생하게.", star: true },
    { en: "Solid drawing", ko: "입체 드로잉", desc: "형태의 부피감." },
    { en: "Appeal", ko: "매력", desc: "보고 싶게 만드는 디자인." }
  ],

  // ── 프롬프트 빌더 기본값 ─────────────────────────
  defaultNegatives: ["3D render", "photorealistic", "live action", "silhouette change", "text artifacts"],
  idlingRule: "Characters must keep subtle idle motion (breathing, blinking, slight sway) and never freeze after an action.",
  styles: ["2D motion graphics", "flat vector illustration", "clay animation", "3D render", "kinetic typography", "anime"],

  // ── 기획 탭 ──────────────────────────────────────
  planning: {
    purposes: ["브랜드 광고", "제품 소개", "SNS 숏폼", "뮤직비디오", "오프닝 타이틀", "설명·인포그래픽", "행사 오프닝", "포트폴리오 작업"],
    runtimes: [6, 10, 15, 30, 60, 90],
    maxRefs: 9,
    // AI 기획안 생성 시 시스템 프롬프트. 워크플로우 원칙(샷 먼저, 길이에 맞는 컷 수, AI가 잘하는 스타일)을 담는다.
    systemPrompt: [
      "당신은 AI 생성 도구(이미지 생성 → 이미지 투 비디오)로 모션그래픽을 만드는 크리에이티브 디렉터입니다.",
      "사용자의 브리프와 스타일 레퍼런스 이미지를 바탕으로 컨셉, 방향성, 시나리오를 한국어로 제안합니다.",
      "",
      "원칙:",
      "- 레퍼런스 이미지는 브리프에 적힌 쓰임대로 참고한다.",
      "  · '스타일': 화풍, 색감, 질감, 빛, 톤 같은 '느낌'만 구체적으로 읽어 방향성에 반영한다. 그 속 캐릭터·사물·구도·글자·로고는 가져오지 않는다.",
      "  · '등장 대상': 그 제품·로고·사물·장소가 작품에 실제로 등장해야 한다. 생김새를 바꾸지 말고 시나리오의 주요 장면에 넣는다.",
      "  · '구도·연출': 화면 구성, 카메라 앵글, 움직임만 샷 설계에 참고한다. 내용과 스타일은 가져오지 않는다.",
      "- 브리프에 '스타일 방향'이나 '스타일 키워드'가 있으면 룩·팔레트에 우선 반영한다.",
      "- 이야기와 등장 요소는 브리프(와 '등장 대상' 레퍼런스)에서 만든다.",
      "- 시나리오는 0초에서 시작해 러닝타임 끝까지 빈틈없이 이어지게 장면(start/end, 초 단위)을 나눈다.",
      "- 한 장면은 AI 영상 모델로 한 번에 생성할 수 있는 길이(보통 2~8초)로 잡는다.",
      "- 장면마다 무엇이 화면에 보이는지(visual)를 이미지 생성 프롬프트로 바로 옮길 수 있을 만큼 구체적으로 쓴다.",
      "- 이미지보다 '샷'을 먼저 설계한다: 와이드·디테일·POV·메타포·매치컷 등을 섞어 리듬을 만든다.",
      "- AI가 표현하기 어려운 것(정확한 글자, 복잡한 손동작, 장면 간 같은 캐릭터 유지)은 피하거나 후반 작업으로 돌리고 risks에 적는다.",
      "- 컬러 팔레트는 4~6색, 실제 hex 값으로 제시한다."
    ].join("\n"),
    // 기획안에서 고른 곳만 AI로 고칠 때 덧붙이는 규칙
    partEditRules: [
      "",
      "지금은 기획안 전체가 아니라 사용자가 고른 곳만 고친다.",
      "- [고칠 곳]에 있는 key 만 parts 로 돌려준다. 다른 곳은 절대 바꾸지 않는다.",
      "- 고르지 않은 부분(앞뒤 장면, 컨셉, 캐릭터)과 이야기·톤이 자연스럽게 이어지게 쓴다.",
      "- '특히 이 부분'이 있으면 그 표현을 중심으로 고치고 나머지 문장은 되도록 살린다.",
      "- text: 제목·한 줄 요약·컨셉·룩. title/visual/duration: 장면. name/description: 캐릭터. palette: 키컬러.",
      "- 장면 길이를 바꿀 이유가 없으면 duration 은 지금 값 그대로 둔다 (2~8초 권장).",
      "- 장면을 나누거나 사이에 넣어 달라는 요청일 때만 add_after 에 새 장면을 넣는다.",
      "- note 에는 무엇을 왜 바꿨는지 한 문장으로 적는다."
    ].join("\n"),
    // 고른 곳을 고칠 때 바로 누를 수 있는 요청
    partPresets: ["더 구체적으로", "더 짧고 간결하게", "더 극적으로", "완전히 다른 아이디어로", "앞뒤 흐름에 맞게"]
  },

  // ── AI 연결 (Claude API) ─────────────────────────
  ai: {
    model: "claude-opus-5-5",
    effort: "medium",
    // 빌드 없이 쓰기 위해 공식 SDK를 CDN에서 동적 import 한다 (버전 고정)
    sdkUrl: "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm"
  },

  // 캐릭터 기준 이미지 (설명으로 처음 만들 때). {name} {desc} {style}
  characterBasePrompt: [
    "Full-body character design of {name}. Character notes (may be Korean): {desc}",
    "Single character, front three-quarter view, neutral standing pose, whole body visible, plain light-gray background, even soft lighting.",
    "{style}",
    "Avoid: other characters, scenery, text, cropped limbs."
  ].join("\n"),

  // 기획 레퍼런스(무드보드)를 이미지 모델에 넘길 때 붙이는 설명 — 스타일·분위기만, 내용은 복사하지 않게
  moodRefNote: "The reference images are a mood board for style only: take their rendering style, color mood, texture, lighting and overall atmosphere. Do NOT copy their characters, objects, layout, composition, text or logos — the content must come from this prompt.",

  // 스토리보드 스케치를 맨 뒤 레퍼런스로 넣을 때 — 구도만 따르고 그림체는 따르지 않게
  boardRefNote: "The LAST reference image is a rough storyboard sketch of this exact shot: follow its composition only — subject placement, framing/shot size, camera angle and screen direction. Do NOT copy its line-drawing look, grey tones, arrows, numbers or annotations; render everything in the final style.",

  // 엔드 프레임(영상이 끝나는 순간의 한 장) — 프롬프트를 쓸 때의 지시
  endFrame: [
    "당신은 이미지 투 비디오 작업을 돕는 모션그래픽 감독입니다.",
    "첨부한 이미지는 이 컷 영상의 시작 프레임입니다. 영상이 '끝나는 순간'의 한 프레임(엔드 프레임)을 만들 영어 이미지 프롬프트를 씁니다.",
    "- 시작 프레임과 같은 화풍·질감·조명·팔레트·캐릭터 디자인·배경을 그대로 유지한다고 분명히 적는다.",
    "- 영상 프롬프트에 적힌 움직임이 모두 끝난 상태(위치·자세·표정·카메라 위치)를 구체적으로 묘사한다.",
    "- 시작 프레임과 너무 달라지지 않게: 한 컷 안에서 자연스럽게 이어질 만큼만 바꾼다.",
    "- en: 영어 프롬프트, ko: 한국어로 한 줄 요약."
  ].join("\n"),
  endFrameRefNote: "Reference image 1 is the START frame of this same shot. Keep the exact same art style, characters, background, lighting and palette — show the moment at the END of the described motion.",

  // 샷 이미지를 앱에서 바로 만들 때 영문 프롬프트 뒤에 붙이는 참조 설명
  shotRefNote: "Use the reference images for consistency: match the rendering style, palette and lighting of any style frame, and keep any character or product exactly as designed in its sheet or reference. Compose a new frame for this shot as described — do not copy a reference's composition unless asked.",

  // 캐릭터 시트 자동 생성 기본 프롬프트 (영문). {name} {desc} {expressions} {props} {look} 를 채운다
  characterSheetPrompt: [
    "Character reference sheet of the character shown in the reference image(s){name}.{desc}",
    "Keep exactly the same face, hairstyle, body proportions, outfit, colors and art style as the reference. Do not redesign the character.",
    "Layout on one plain light-gray background, evenly lit, clean and organized:",
    "- Top row: full-body turnaround — front view, side view, back view — same scale and same height, neutral standing pose.",
    "- Middle row: head close-ups showing these facial expressions: {expressions}.",
    "{props}",
    "{look}",
    "Avoid: extra characters, scenery, text labels, watermarks, changing the outfit or colors between views."
  ].join("\n"),

  // 영상 길이(초)별 권장 컷 수
  recommendedCuts(seconds) {
    if (seconds <= 5) return [1, 2];
    if (seconds <= 10) return [3, 7];
    if (seconds <= 15) return [5, 9];
    return [Math.round(seconds * 0.4), Math.round(seconds * 0.6)];
  }
};
