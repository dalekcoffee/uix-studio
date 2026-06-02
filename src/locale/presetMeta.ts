// Localized preset NAMES + DESCRIPTIONS for the Preset menu (chrome, not panel
// content). English lives on the descriptor in model/presets.ts; this map adds
// ko/es/ja keyed by preset id. Unmapped ids / English fall back to the English
// descriptor text. Translations by Claude — may be imperfect.
import type { Lang } from "./types";

type Target = Exclude<Lang, "en">;
interface PresetMeta {
  name: Record<Target, string>;
  description: Record<Target, string>;
}

const PRESET_META: Record<string, PresetMeta> = {
  experimental: {
    name: { ko: "실험용 패널", es: "Panel experimental", ja: "実験用パネル" },
    description: {
      ko: "전체 샘플 패널 — 모든 인터랙티브 컨트롤을 한 캔버스에: 헤더(아이콘 + 제목 + 스피너 + 닫기), 체크박스, 토글, 슬라이더, 텍스트 필드 3개, 라디오 그룹, 진행률 표시줄, 드롭다운, 색상 선택기, 참조 수신 필드, 스크롤 영역, 액션 버튼 2개. 기본 시작점이자 새 기능의 첫 적용 대상입니다.",
      es: "Panel de muestra completo — todos los controles interactivos en un solo lienzo: encabezado (icono + título + indicador + cerrar), casilla, interruptor, deslizador, tres campos de texto, grupo de radios, barra de progreso, desplegable, selector de color, campo de referencia, área de desplazamiento y dos botones de acción. El punto de partida por defecto y el primer objetivo de las nuevas funciones.",
      ja: "フル機能のサンプルパネル — すべてのインタラクティブなコントロールを1つのキャンバスに: ヘッダー（アイコン＋タイトル＋スピナー＋閉じる）、チェックボックス、トグル、スライダー、テキストフィールド3つ、ラジオグループ、プログレスバー、ドロップダウン、カラーピッカー、参照受信フィールド、スクロール領域、アクションボタン2つ。既定の出発点であり、新機能の最初の対象です。",
    },
  },
  "simple-dialog": {
    name: { ko: "간단한 대화 상자 팝업", es: "Diálogo emergente simple", ja: "シンプルなダイアログ" },
    description: {
      ko: "모달 형식의 대화 상자: 어두운 배경, 가운데 카드, 제목, 본문 텍스트, OK 버튼, 모서리의 빨간 ✕ 닫기.",
      es: "Diálogo tipo modal: fondo atenuado, tarjeta centrada, título, texto, botón OK y una ✕ roja de cierre en la esquina.",
      ja: "モーダル形式のダイアログ: 暗い背景、中央のカード、タイトル、本文、OK ボタン、隅の赤い ✕ 閉じるボタン。",
    },
  },
  "basic-text": {
    name: { ko: "기본 텍스트", es: "Texto básico", ja: "基本テキスト" },
    description: {
      ko: "800×200 캔버스에 가운데 정렬된 텍스트 슬롯 하나. 표지판의 좋은 시작점입니다.",
      es: "Un único slot de Texto centrado en un lienzo de 800×200. Buen punto de partida para letreros.",
      ja: "800×200 のキャンバスに中央寄せのテキストスロットが1つ。看板の出発点に便利です。",
    },
  },
  "labeled-button": {
    name: { ko: "라벨 버튼", es: "Botón con etiqueta", ja: "ラベル付きボタン" },
    description: {
      ko: "작은 캔버스에 라벨이 붙은 독립 버튼 하나 — 최소한의 인터랙티브 컨트롤.",
      es: "Un botón con etiqueta independiente en un lienzo pequeño — control interactivo mínimo.",
      ja: "小さなキャンバスに単体のラベル付きボタン — 最小限のインタラクティブコントロール。",
    },
  },
  installer: {
    name: { ko: "설치 프로그램", es: "Instalador", ja: "インストーラー" },
    description: {
      ko: "정사각형 설치 대화 상자: 제목 + 닫기 버튼, 헤더 알약, 이미지 자리 표시자 1개, 기타 메모 알약, 설치 / 제거 액션.",
      es: "Diálogo de instalador cuadrado: título + botón de cerrar, una píldora de encabezado, un marcador de imagen, una píldora de notas varias y acciones Instalar / Desinstalar.",
      ja: "正方形のインストーラーダイアログ: タイトル＋閉じるボタン、ヘッダーのピル、画像プレースホルダー1つ、その他メモのピル、インストール / アンインストールの操作。",
    },
  },
  "login-basic": {
    name: { ko: "로그인 양식 (기본)", es: "Formulario de inicio de sesión (básico)", ja: "ログインフォーム（基本）" },
    description: {
      ko: "브랜드 블루 제목 바가 있는 가운데 카드, 아이콘이 붙은 텍스트 필드 2개(이메일 / 비밀번호), 비밀번호 찾기 링크, 전체 너비 로그인 버튼, 회원가입 푸터. 바로 쓰는 로그인 패널로 사용하세요.",
      es: "Tarjeta centrada con una barra de título azul de marca, dos campos de texto con icono (Correo / Contraseña), un enlace de contraseña olvidada, un botón de inicio de sesión de ancho completo y un pie de registro. Úsala como panel de inicio de sesión listo para usar.",
      ja: "ブランドブルーのタイトルバーを持つ中央のカード、アイコン付きテキストフィールド2つ（メール / パスワード）、パスワードを忘れた場合のリンク、全幅のログインボタン、サインアップのフッター。そのまま使えるサインインパネルとしてどうぞ。",
    },
  },
  "login-stylized": {
    name: { ko: "로그인 양식 (스타일)", es: "Formulario de inicio de sesión (estilizado)", ja: "ログインフォーム（スタイル）" },
    description: {
      ko: "좌우로 나뉜 가로 레이아웃: 왼쪽 절반은 전체 이미지 자리 표시자(원하는 아트를 넣으세요), 오른쪽 절반은 폼 — 로고, Hello Again 헤더, 이메일 + 비밀번호 필드, 로그인 상태 유지 체크박스, 비밀번호 복구 링크, 로그인 버튼, 회원가입 푸터.",
      es: "Diseño horizontal dividido: la mitad izquierda es un marcador de imagen completo (pon tu propio arte) y la mitad derecha contiene el formulario — logo, encabezado Hello Again, campos de correo + contraseña, casilla Recuérdame, enlace de recuperación de contraseña, botón de inicio de sesión y pie de registro.",
      ja: "左右に分かれた横長レイアウト: 左半分は全面の画像プレースホルダー（好きなアートを入れてください）、右半分はフォーム — ロゴ、Hello Again ヘッダー、メール＋パスワードのフィールド、ログイン状態を保持するチェックボックス、パスワード復旧リンク、ログインボタン、サインアップのフッター。",
    },
  },
  "checklist-form": {
    name: { ko: "체크리스트 양식", es: "Formulario de lista de verificación", ja: "チェックリストフォーム" },
    description: {
      ko: "두 섹션 체크리스트: 상단에 고정 체크박스 5개, 하단에 스크롤 체크박스 10개(뷰포트보다 내용이 많아 항상 스크롤이 필요함), 하단에 자유 입력 메모 필드. 작업 목록, 평가지, 승인 양식으로 바로 사용할 수 있습니다.",
      es: "Lista de verificación de dos secciones: 5 casillas fijas arriba, 10 casillas desplazables debajo (más contenido que la vista, así que siempre hay que desplazarse) y un campo de Notas de texto libre al final. Lista para usar como lista de tareas, hoja de evaluación o formulario de aprobación.",
      ja: "2セクションのチェックリスト: 上部に固定チェックボックス5個、下部にスクロールするチェックボックス10個（ビューポートより内容が多く常にスクロールが必要）、最下部に自由記入のメモ欄。タスクリスト・評価シート・承認フォームとしてすぐ使えます。",
    },
  },
  "rating-form": {
    name: { ko: "평가 양식", es: "Formulario de valoración", ja: "評価フォーム" },
    description: {
      ko: "두 섹션 평가지: 고정 행 5개와 스크롤 행 8개, 각 행에 NA / 1-5 라디오 버튼이 라벨이 붙은 열 격자로 배치됩니다. 각 섹션 아래에 점수 표시 텍스트 슬롯(고정 점수, 스크롤 점수, 총점)이 자리 표시자로 있습니다 — 실시간 계산을 하려면 Resonite에서 ProtoFlux로 연결하세요.",
      es: "Hoja de valoración de dos secciones: 5 filas fijas y 8 filas desplazables, cada una con botones de radio NA / 1-5 dispuestos en una cuadrícula de columnas etiquetadas. Debajo de cada sección hay slots de Texto para la puntuación (Puntuación fija, Puntuación desplazable, Puntuación total) como marcadores — conéctalos a ProtoFlux en Resonite para el cálculo en vivo.",
      ja: "2セクションの評価シート: 固定行5つとスクロール行8つ、それぞれ NA / 1-5 のラジオボタンがラベル付きの列グリッドに並びます。各セクションの下にスコア表示のテキストスロット（固定スコア、スクロールスコア、合計スコア）がプレースホルダーとしてあります — ライブ計算には Resonite で ProtoFlux に接続してください。",
    },
  },
  "id-vtuber-compact": {
    name: { ko: "버튜버 ID 카드 (간단)", es: "Tarjeta de ID de VTuber (compacta)", ja: "VTuber ID カード（コンパクト）" },
    description: {
      ko: "세로 카드: 왼쪽에 큰 아바타 자리 표시자, 오른쪽에 세로로 쌓인 필드 목록(이름, 생일, 성별, 언어, 콘텐츠, 최애 마크). 라벨과 제목 칩에 브랜드 블루 강조.",
      es: "Tarjeta vertical con un gran marcador de avatar a la izquierda y una lista de campos apilada a la derecha (Nombre, Cumpleaños, Género, Idioma, Contenido, Marca de Oshi). Acentos azules de marca en las etiquetas y el chip de título.",
      ja: "縦型カード: 左側に大きなアバタープレースホルダー、右側に縦に並んだフィールド一覧（名前、誕生日、性別、言語、コンテンツ、推しマーク）。ラベルとタイトルチップにブランドブルーのアクセント。",
    },
  },
  "id-vtuber-detailed": {
    name: { ko: "버튜버 ID 카드 (상세)", es: "Tarjeta de ID de VTuber (detallada)", ja: "VTuber ID カード（詳細）" },
    description: {
      ko: "섹션이 가득한 가로 카드 — 자기소개, 방송 내용, 언어, 좌우명, 내 소셜 미디어, 내가 좋아하는 것, 싫어하는 것 — 그리고 큰 아바타 타일과 VTUBER ID CARD 헤더. 사람들이 온라인에 공유하는 빽빽한 버튜버 프로필 레이아웃을 본떴습니다.",
      es: "Tarjeta horizontal repleta de secciones — Sobre mí, Transmito, Idioma, Mi lema favorito, Mis redes sociales, Mis favoritos, No me gusta — más un gran mosaico de avatar y un encabezado VTUBER ID CARD. Refleja el denso diseño de perfil de VTuber que la gente comparte en línea.",
      ja: "セクション満載の横型カード — 自己紹介、配信内容、言語、好きな座右の銘、私のSNS、お気に入り、苦手なもの — に加えて大きなアバタータイルと VTUBER ID CARD ヘッダー。ネットでよく共有される情報量の多い VTuber プロフィールのレイアウトを再現しています。",
    },
  },
  "id-student": {
    name: { ko: "학생 신분증", es: "Tarjeta de identificación estudiantil", ja: "学生証" },
    description: {
      ko: "작은 가로 ID 카드: 브랜드 블루 헤더 줄(로고 + 기관 이름 + 신분증 부제), 오른쪽 세로 아바타 타일, 왼쪽 학과 / 이름 / 출생 / 학년 필드. ILUNA 스타일.",
      es: "Tarjeta de identificación horizontal pequeña con una franja de encabezado azul de marca (logo + nombre del instituto + subtítulo de identificación), un mosaico de avatar vertical a la derecha y campos de Departamento / Nombre / Nacido / Grado a la izquierda. Estilo ILUNA.",
      ja: "小さな横型 ID カード: ブランドブルーのヘッダー帯（ロゴ＋学校名＋身分証のサブタイトル）、右側に縦型アバタータイル、左側に学部 / 名前 / 生年月日 / 学年のフィールド。ILUNA 風。",
    },
  },
  keypad: {
    name: { ko: "숫자 키패드", es: "Teclado numérico", ja: "数字キーパッド" },
    description: {
      ko: "iOS 17 스타일 숫자 키패드: 상단에 입력한 숫자를 보여주는 큰 디스플레이, 3×4 버튼 격자(1-9, 소수점, 0, 백스페이스)와 각 숫자 아래 글자, 그리고 Enter와 Clear 액션 버튼. 각 숫자 버튼은 KeypadKey 마커를 통해 자기 글자를 디스플레이에 씁니다. V1 참고: 누를 때마다 디스플레이를 덮어씁니다(진짜 이어쓰기 동작에는 Resonite의 ProtoFlux 노드가 필요합니다).",
      es: "Teclado numérico estilo iOS 17: pantalla grande arriba que muestra los dígitos escritos, cuadrícula de botones 3×4 (1-9, punto decimal, 0, retroceso) con letras debajo de cada número, además de botones de acción Enter y Clear. Cada botón de dígito escribe su carácter en la pantalla mediante marcadores KeypadKey. Nota V1: cada pulsación sobrescribe la pantalla (el comportamiento real de añadir requiere un nodo ProtoFlux en Resonite).",
      ja: "iOS 17 風の数字キーパッド: 上部に入力した数字を表示する大きなディスプレイ、3×4 のボタングリッド（1-9、小数点、0、バックスペース）と各数字の下の文字、さらに Enter と Clear のアクションボタン。各数字ボタンは KeypadKey マーカーを介して自分の文字をディスプレイに書き込みます。V1 注記: 押すたびにディスプレイを上書きします（本来の追記動作には Resonite の ProtoFlux ノードが必要です）。",
    },
  },
  "profile-card": {
    name: { ko: "프로필 카드", es: "Tarjeta de perfil", ja: "プロフィールカード" },
    description: {
      ko: "상단 배너, 경계에 걸친 둥근 아바타, 오른쪽에 표시 이름 + 사용자 이름, 편집 가능한 상태 필드, 소셜 버튼 한 줄.",
      es: "Banner arriba, avatar redondo a caballo sobre la unión, nombre visible + nombre de usuario a la derecha, campo de estado editable y una fila de botones sociales.",
      ja: "上部にバナー、境目にまたがる丸いアバター、右側に表示名＋ユーザー名、編集可能なステータス欄、SNS ボタンの行。",
    },
  },
  showcase: {
    name: { ko: "UIX Studio 쇼케이스", es: "Escaparate de UIX Studio", ja: "UIX Studio ショーケース" },
    description: {
      ko: "에디터 자체로 만든 UIX Studio 과학 박람회 포스터 광고: 헤더 배너 + 짧은 설명과 정중앙의 로고. 왼쪽은 탭 컨트롤 갤러리(탭이 왼쪽에 있음) — 입력(버튼, 슬라이더, 텍스트 필드), 선택(토글, 체크박스, 드롭다운), 표시(진행률 표시줄, 스피너, 색상 선택기), 대화 상자(팝업, 링크) — 각각 라이브 예제가 있습니다. 오른쪽 보드는 더 많은 컨트롤의 실제 스크롤 목록입니다. 그래서 두 가지 컨테이너 스타일(탭과 스크롤 영역)은 물론 스크롤, 로딩 스피너, 팝업 대화 상자까지 보여줍니다. 바로 자랑할 수 있는 홍보물.",
      es: "Un anuncio tipo póster de feria de ciencias para UIX Studio, hecho con el propio editor: un banner de encabezado + una breve descripción y el logo justo en el centro. La sección izquierda es una galería de controles con pestañas (pestañas a la izquierda) — Entradas (Botones, Deslizadores, Campos de texto), Opciones (Interruptor, Casilla, Desplegable), Visualización (Barra de progreso, Indicador de carga, Selector de color) y Diálogos (Emergente, Enlace) — cada uno con un ejemplo en vivo; el tablero derecho es una lista desplazable real de más controles. Así luce AMBOS estilos de contenedor (pestañas y un área desplazable), además del desplazamiento, el indicador de carga y los diálogos emergentes. Una pieza promocional lista para presumir.",
      ja: "エディター自体で作った UIX Studio の科学フェアポスター風の広告: ヘッダーバナー＋短い説明と、中央に配置したロゴ。左側はタブ式のコントロールギャラリー（タブは左）— 入力（ボタン、スライダー、テキストフィールド）、選択（トグル、チェックボックス、ドロップダウン）、表示（プログレスバー、スピナー、カラーピッカー）、ダイアログ（ポップアップ、リンク）— それぞれにライブ例があります。右のボードはさらに多くのコントロールの実際にスクロールできるリストです。そのため 2 種類のコンテナスタイル（タブとスクロール領域）に加え、スクロール・ローディングスピナー・ポップアップダイアログも披露できます。すぐに自慢できるプロモ作品。",
    },
  },
  blank: {
    name: { ko: "빈 캔버스", es: "Lienzo en blanco", ja: "空のキャンバス" },
    description: {
      ko: "그냥 비어 있는 800×600 캔버스. 모든 것을 처음부터 만드세요.",
      es: "Solo un lienzo vacío de 800×600. Construye todo desde cero.",
      ja: "ただの空の 800×600 キャンバス。すべてをゼロから作りましょう。",
    },
  },
};

export function localizedPresetName(id: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return PRESET_META[id]?.name[lang as Target] ?? en;
}

export function localizedPresetDescription(id: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return PRESET_META[id]?.description[lang as Target] ?? en;
}
