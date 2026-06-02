// Build-time localization of DESIGNED preset content.
//
// Presets build their slot trees in English (see model/presets.ts). Rather than
// thread a language through all 16 build functions and rewrite hundreds of
// literals, we translate the finished tree once at load time: localizePanelText
// walks it and swaps the user-facing text props (Text.content, Popup.*,
// TextField.*, Dropdown option lines) using PRESET_TEXT, an English→target map.
//
// Coverage degrades gracefully: any string NOT in the map is left as English.
// Symbols / digits / keypad letters / proper nouns are intentionally absent so
// they pass through unchanged. The starter template ("experimental" preset) is
// localized separately via getDict().content, so its strings need not appear here
// (and if they do, they simply never match — it's already built in-language).
//
// Translations by Claude — may be imperfect.
import type { Slot, UixComponent } from "../model/types";
import type { Lang } from "./types";

type Target = Exclude<Lang, "en">;

const PRESET_TEXT: Record<string, Record<Target, string>> = {
  "• Art\n• Games\n• Just chatting\n• Other ...": {
    ko: "• 아트\n• 게임\n• 잡담\n• 기타 ...",
    es: "• Arte\n• Juegos\n• Charla\n• Otros ...",
    ja: "• アート\n• ゲーム\n• 雑談\n• その他 ...",
  },
  "ABOUT ME": { ko: "자기소개", es: "SOBRE MÍ", ja: "自己紹介" },
  "About this panel": { ko: "이 패널에 대하여", es: "Acerca de este panel", ja: "このパネルについて" },
  "Accessibility audit done": { ko: "접근성 점검 완료", es: "Auditoría de accesibilidad hecha", ja: "アクセシビリティ監査完了" },
  "Add notes here…": { ko: "여기에 메모를 추가하세요…", es: "Añade notas aquí…", ja: "ここにメモを追加…" },
  "Any button can spawn a dialog window like this one — great for confirmations, info, or warnings. Edit the Popup component on this button to change what it says.": {
    ko: "어떤 버튼이든 이렇게 대화 상자를 띄울 수 있습니다 — 확인, 정보, 경고에 유용합니다. 이 버튼의 Popup 컴포넌트를 편집하여 내용을 변경하세요.",
    es: "Cualquier botón puede abrir una ventana de diálogo como esta — ideal para confirmaciones, información o advertencias. Edita el componente Popup de este botón para cambiar lo que dice.",
    ja: "どのボタンでもこのようなダイアログを表示できます — 確認・情報・警告に便利です。このボタンの Popup コンポーネントを編集して内容を変更してください。",
  },
  "Archive completed files": { ko: "완료된 파일 보관", es: "Archivar archivos completados", ja: "完了したファイルをアーカイブ" },
  "Birthday": { ko: "생일", es: "Cumpleaños", ja: "誕生日" },
  "Born": { ko: "출생", es: "Nacido", ja: "生年月日" },
  "Buttons": { ko: "버튼", es: "Botones", ja: "ボタン" },
  "Changelog version bumped": { ko: "변경 로그 버전 올림", es: "Versión del registro de cambios actualizada", ja: "変更履歴のバージョン更新" },
  "check out the tool :3": { ko: "이 도구를 확인해 보세요 :3", es: "echa un vistazo a la herramienta :3", ja: "このツールをチェックしてね :3" },
  "Checkbox": { ko: "체크박스", es: "Casilla", ja: "チェックボックス" },
  "Checklist Form": { ko: "체크리스트 양식", es: "Formulario de lista", ja: "チェックリストフォーム" },
  "Choices": { ko: "선택", es: "Opciones", ja: "選択" },
  "Choose any color you like.": { ko: "원하는 색을 자유롭게 고르세요.", es: "Elige el color que quieras.", ja: "好きな色を自由に選べます。" },
  "Clear": { ko: "지우기", es: "Borrar", ja: "クリア" },
  "Click me": { ko: "클릭하세요", es: "Haz clic", ja: "クリックして" },
  "Color Picker": { ko: "색상 선택기", es: "Selector de color", ja: "カラーピッカー" },
  "Confirm stakeholder sign-off": { ko: "이해관계자 승인 확인", es: "Confirmar aprobación de interesados", ja: "関係者の承認を確認" },
  "Content": { ko: "콘텐츠", es: "Contenido", ja: "コンテンツ" },
  "Customisability": { ko: "맞춤 설정 가능성", es: "Personalización", ja: "カスタマイズ性" },
  "Department": { ko: "학과", es: "Departamento", ja: "学部" },
  "Department Name": { ko: "학과 이름", es: "Nombre del departamento", ja: "学部名" },
  "Deploy to staging verified": { ko: "스테이징 배포 확인됨", es: "Despliegue en staging verificado", ja: "ステージングへのデプロイ確認済み" },
  "Design real Resonite panels right in your browser, then drop them straight into the game. Here's a taste of what you can build:": {
    ko: "브라우저에서 실제 Resonite 패널을 디자인하고, 게임에 바로 끌어다 놓으세요. 만들 수 있는 것의 일부를 소개합니다:",
    es: "Diseña paneles reales de Resonite en tu navegador y arrástralos directamente al juego. Aquí tienes una muestra de lo que puedes crear:",
    ja: "ブラウザで本物の Resonite パネルをデザインし、そのままゲームにドロップできます。作れるものの一例をご紹介します:",
  },
  "Dial in a value smoothly.": { ko: "값을 부드럽게 조절하세요.", es: "Ajusta un valor con suavidad.", ja: "値をなめらかに調整。" },
  "Dialogs": { ko: "대화 상자", es: "Diálogos", ja: "ダイアログ" },
  "Display": { ko: "표시", es: "Visualización", ja: "表示" },
  "Display Name": { ko: "표시 이름", es: "Nombre visible", ja: "表示名" },
  "Documentation clarity": { ko: "문서 명확성", es: "Claridad de la documentación", ja: "ドキュメントの分かりやすさ" },
  "Don't have an account yet?": { ko: "아직 계정이 없으신가요?", es: "¿Aún no tienes cuenta?", ja: "まだアカウントをお持ちでない方" },
  "Dropdown": { ko: "드롭다운", es: "Desplegable", ja: "ドロップダウン" },
  "Ease of use": { ko: "사용 편의성", es: "Facilidad de uso", ja: "使いやすさ" },
  "Edit this text in the Inspector.": { ko: "인스펙터에서 이 텍스트를 편집하세요.", es: "Edita este texto en el Inspector.", ja: "インスペクターでこのテキストを編集してください。" },
  "Email": { ko: "이메일", es: "Correo electrónico", ja: "メール" },
  "Email or Phone": { ko: "이메일 또는 전화번호", es: "Correo o teléfono", ja: "メールまたは電話番号" },
  "English": { ko: "영어", es: "Inglés", ja: "英語" },
  "English / ...": { ko: "영어 / ...", es: "Inglés / ...", ja: "英語 / ..." },
  "Enter": { ko: "입력", es: "Entrar", ja: "決定" },
  "Error handling": { ko: "오류 처리", es: "Manejo de errores", ja: "エラー処理" },
  "Feature completeness": { ko: "기능 완성도", es: "Completitud de funciones", ja: "機能の充実度" },
  "Flip a setting on or off.": { ko: "설정을 켜고 끄세요.", es: "Activa o desactiva un ajuste.", ja: "設定をオン・オフ切り替え。" },
  "Food — ...\nDrink — ...\nColor — ...\nAnimal — ...\nSeason — ...\nGame — ...": {
    ko: "음식 — ...\n음료 — ...\n색 — ...\n동물 — ...\n계절 — ...\n게임 — ...",
    es: "Comida — ...\nBebida — ...\nColor — ...\nAnimal — ...\nEstación — ...\nJuego — ...",
    ja: "食べ物 — ...\n飲み物 — ...\n色 — ...\n動物 — ...\n季節 — ...\nゲーム — ...",
  },
  "Forgot password?": { ko: "비밀번호를 잊으셨나요?", es: "¿Olvidaste tu contraseña?", ja: "パスワードをお忘れですか？" },
  "Gender": { ko: "성별", es: "Género", ja: "性別" },
  "Got it": { ko: "확인", es: "Entendido", ja: "OK" },
  "Grade": { ko: "학년", es: "Grado", ja: "学年" },
  "Header": { ko: "헤더", es: "Encabezado", ja: "ヘッダー" },
  "Heads up": { ko: "알림", es: "Atención", ja: "お知らせ" },
  "Hello Again!": { ko: "다시 오셨군요!", es: "¡Hola de nuevo!", ja: "おかえりなさい！" },
  "Hello!": { ko: "안녕하세요!", es: "¡Hola!", ja: "こんにちは！" },
  "Hi I'm ...\nYou can call me ...\nMy birthday is ...": {
    ko: "안녕하세요, 저는 ...\n저를 ...라고 불러 주세요\n제 생일은 ...",
    es: "Hola, soy ...\nPuedes llamarme ...\nMi cumpleaños es ...",
    ja: "こんにちは、私は ...\n...と呼んでください\n誕生日は ...",
  },
  "High": { ko: "높음", es: "Alta", ja: "高" },
  "I DISLIKE": { ko: "싫어하는 것", es: "NO ME GUSTA", ja: "苦手なもの" },
  "I STREAM": { ko: "방송 내용", es: "TRANSMITO", ja: "配信内容" },
  "Inputs": { ko: "입력", es: "Entradas", ja: "入力" },
  "Install": { ko: "설치", es: "Instalar", ja: "インストール" },
  "Installer Title": { ko: "설치 프로그램 제목", es: "Título del instalador", ja: "インストーラーのタイトル" },
  "INTERACT": { ko: "상호작용", es: "INTERACTÚA", ja: "操作する" },
  "It's a pop-up!": { ko: "팝업입니다!", es: "¡Es una ventana emergente!", ja: "ポップアップです！" },
  "Language": { ko: "언어", es: "Idioma", ja: "言語" },
  "LANGUAGE": { ko: "언어", es: "IDIOMA", ja: "言語" },
  "Let people type in-world.": { ko: "월드 안에서 입력할 수 있게 하세요.", es: "Deja que la gente escriba en el mundo.", ja: "ワールド内で入力できるようにします。" },
  "Link": { ko: "링크", es: "Enlace", ja: "リンク" },
  "Localisation strings updated": { ko: "현지화 문자열 업데이트됨", es: "Cadenas de localización actualizadas", ja: "ローカライズ文字列を更新" },
  "Login": { ko: "로그인", es: "Iniciar sesión", ja: "ログイン" },
  "Login Form": { ko: "로그인 양식", es: "Formulario de inicio de sesión", ja: "ログインフォーム" },
  "Low": { ko: "낮음", es: "Baja", ja: "低" },
  "Medium": { ko: "중간", es: "Media", ja: "中" },
  "Miscellaneous Notes": { ko: "기타 메모", es: "Notas varias", ja: "その他のメモ" },
  "Month Day": { ko: "월 일", es: "Mes Día", ja: "月 日" },
  "MORE CONTROLS": { ko: "추가 컨트롤", es: "MÁS CONTROLES", ja: "その他のコントロール" },
  "MY FAVORITE MOTTO": { ko: "좌우명", es: "MI LEMA FAVORITO", ja: "好きな座右の銘" },
  "MY FAVORITES": { ko: "내가 좋아하는 것", es: "MIS FAVORITOS", ja: "お気に入り" },
  "MY SOCIAL MEDIA": { ko: "내 소셜 미디어", es: "MIS REDES SOCIALES", ja: "私のSNS" },
  "Name": { ko: "이름", es: "Nombre", ja: "名前" },
  "Neat!": { ko: "멋지네요!", es: "¡Genial!", ja: "いいね！" },
  "Not a member?": { ko: "회원이 아니신가요?", es: "¿No eres miembro?", ja: "メンバーではないですか？" },
  "Notes": { ko: "메모", es: "Notas", ja: "メモ" },
  "Notify team on completion": { ko: "완료 시 팀에 알림", es: "Notificar al equipo al completar", ja: "完了時にチームへ通知" },
  "OK": { ko: "확인", es: "Aceptar", ja: "OK" },
  "Open": { ko: "열기", es: "Abrir", ja: "開く" },
  "Organization Name": { ko: "기관 이름", es: "Nombre de la organización", ja: "組織名" },
  "Oshi mark": { ko: "최애 마크", es: "Marca de Oshi", ja: "推しマーク" },
  "Overall quality": { ko: "전반적인 품질", es: "Calidad general", ja: "総合的な品質" },
  "Overall satisfaction": { ko: "전반적인 만족도", es: "Satisfacción general", ja: "総合満足度" },
  "Password": { ko: "비밀번호", es: "Contraseña", ja: "パスワード" },
  "Peer code review completed": { ko: "동료 코드 리뷰 완료", es: "Revisión de código por pares completada", ja: "ピアコードレビュー完了" },
  "Performance": { ko: "성능", es: "Rendimiento", ja: "パフォーマンス" },
  "Performance benchmarks met": { ko: "성능 기준 충족", es: "Pruebas de rendimiento superadas", ja: "パフォーマンス基準達成" },
  "Pick one from a menu.": { ko: "메뉴에서 하나를 고르세요.", es: "Elige uno de un menú.", ja: "メニューから一つ選びます。" },
  "Pop open a modal window.": { ko: "모달 창을 띄우세요.", es: "Abre una ventana modal.", ja: "モーダルウィンドウを開きます。" },
  "Popup Dialog": { ko: "팝업 대화 상자", es: "Diálogo emergente", ja: "ポップアップダイアログ" },
  "Press me": { ko: "눌러보세요", es: "Presióname", ja: "押してね" },
  "Progress Bar": { ko: "진행률 표시줄", es: "Barra de progreso", ja: "プログレスバー" },
  "Rating Form": { ko: "평가 양식", es: "Formulario de valoración", ja: "評価フォーム" },
  "Recovery Password": { ko: "비밀번호 복구", es: "Recuperar contraseña", ja: "パスワードの復旧" },
  "Release notes written": { ko: "릴리스 노트 작성됨", es: "Notas de la versión escritas", ja: "リリースノート作成済み" },
  "Remember me": { ko: "로그인 상태 유지", es: "Recuérdame", ja: "ログイン状態を保持" },
  "Replace this with your panel's description. Edit the Popup component on the Icon slot to change the title and body.": {
    ko: "이 부분을 패널 설명으로 바꾸세요. Icon 슬롯의 Popup 컴포넌트를 편집하여 제목과 본문을 변경할 수 있습니다.",
    es: "Reemplaza esto con la descripción de tu panel. Edita el componente Popup en el slot Icon para cambiar el título y el cuerpo.",
    ja: "ここをパネルの説明に置き換えてください。Icon スロットの Popup コンポーネントを編集すると、タイトルと本文を変更できます。",
  },
  "Requires no install, no account, and is free to use!": {
    ko: "설치도 계정도 필요 없고, 무료로 사용할 수 있습니다!",
    es: "¡No requiere instalación ni cuenta, y es gratis!",
    ja: "インストール不要・アカウント不要・無料で使えます！",
  },
  "Response time": { ko: "응답 시간", es: "Tiempo de respuesta", ja: "応答時間" },
  "Review project scope": { ko: "프로젝트 범위 검토", es: "Revisar el alcance del proyecto", ja: "プロジェクト範囲の確認" },
  "Run automated tests": { ko: "자동화 테스트 실행", es: "Ejecutar pruebas automatizadas", ja: "自動テストを実行" },
  "Scroll for more  ↓": { ko: "더 보려면 스크롤  ↓", es: "Desplázate para ver más  ↓", ja: "スクロールでもっと見る  ↓" },
  "Scrollable Items": { ko: "스크롤 항목", es: "Elementos desplazables", ja: "スクロール項目" },
  "Scrollable Questions": { ko: "스크롤 질문", es: "Preguntas desplazables", ja: "スクロール質問" },
  "Scrollable Score: — / 40": { ko: "스크롤 점수: — / 40", es: "Puntuación desplazable: — / 40", ja: "スクロールスコア: — / 40" },
  "Security scan passed": { ko: "보안 검사 통과", es: "Análisis de seguridad superado", ja: "セキュリティスキャン合格" },
  "Send people to any URL.": { ko: "원하는 URL로 보내세요.", es: "Lleva a la gente a cualquier URL.", ja: "好きなURLへ誘導します。" },
  "Show how far along you are.": { ko: "진행 상황을 보여주세요.", es: "Muestra cuánto has avanzado.", ja: "進み具合を表示します。" },
  "Signal that something's loading.": { ko: "로딩 중임을 알리세요.", es: "Indica que algo está cargando.", ja: "読み込み中であることを知らせます。" },
  "Sign Up": { ko: "회원가입", es: "Registrarse", ja: "新規登録" },
  "Slider": { ko: "슬라이더", es: "Control deslizante", ja: "スライダー" },
  "Sliders": { ko: "슬라이더", es: "Controles deslizantes", ja: "スライダー" },
  "Spinner": { ko: "스피너", es: "Indicador de carga", ja: "スピナー" },
  "Stability / reliability": { ko: "안정성 / 신뢰성", es: "Estabilidad / fiabilidad", ja: "安定性 / 信頼性" },
  "Static Items": { ko: "고정 항목", es: "Elementos fijos", ja: "固定項目" },
  "Static Questions": { ko: "고정 질문", es: "Preguntas fijas", ja: "固定質問" },
  "Static Score: — / 25": { ko: "고정 점수: — / 25", es: "Puntuación fija: — / 25", ja: "固定スコア: — / 25" },
  "Stay curious, stream often.": { ko: "호기심을 잃지 말고, 자주 방송하세요.", es: "Sigue con curiosidad, transmite a menudo.", ja: "好奇心を持って、こまめに配信しよう。" },
  "Streaming / vlogs": { ko: "방송 / 브이로그", es: "Streaming / vlogs", ja: "配信 / ブログ" },
  "STUDENT IDENTIFICATION CARD": { ko: "학생 신분증", es: "TARJETA DE IDENTIFICACIÓN ESTUDIANTIL", ja: "学生証" },
  "Support experience": { ko: "지원 경험", es: "Experiencia de soporte", ja: "サポート体験" },
  "Text Field": { ko: "텍스트 필드", es: "Campo de texto", ja: "テキストフィールド" },
  "Text Fields": { ko: "텍스트 필드", es: "Campos de texto", ja: "テキストフィールド" },
  "Tick items off a list.": { ko: "목록에서 항목을 체크하세요.", es: "Marca elementos de una lista.", ja: "リストの項目にチェックします。" },
  "This is the message your users will read.\nEdit the Title, Body, and OK label in the Inspector.": {
    ko: "사용자가 읽게 될 메시지입니다.\n인스펙터에서 제목, 본문, OK 라벨을 편집하세요.",
    es: "Este es el mensaje que leerán tus usuarios.\nEdita el Título, el Cuerpo y la etiqueta OK en el Inspector.",
    ja: "これはユーザーが読むメッセージです。\nインスペクターでタイトル・本文・OK ラベルを編集してください。",
  },
  "Toggle": { ko: "토글", es: "Interruptor", ja: "トグル" },
  "Total Score: — / 65": { ko: "총점: — / 65", es: "Puntuación total: — / 65", ja: "合計スコア: — / 65" },
  "Trigger anything with a tap.": { ko: "한 번의 탭으로 무엇이든 실행하세요.", es: "Activa cualquier cosa con un toque.", ja: "タップで何でも実行。" },
  "Uninstall": { ko: "제거", es: "Desinstalar", ja: "アンインストール" },
  "Update documentation": { ko: "문서 업데이트", es: "Actualizar la documentación", ja: "ドキュメントを更新" },
  "Validate deliverables": { ko: "산출물 검증", es: "Validar entregables", ja: "成果物を検証" },
  "Value for effort": { ko: "노력 대비 가치", es: "Relación esfuerzo-valor", ja: "労力に対する価値" },
  "Visual design": { ko: "비주얼 디자인", es: "Diseño visual", ja: "ビジュアルデザイン" },
  "VTuber ID Card": { ko: "버튜버 ID 카드", es: "Tarjeta de ID de VTuber", ja: "VTuber ID カード" },
  "VTUBER ID CARD": { ko: "버튜버 ID 카드", es: "TARJETA DE ID DE VTUBER", ja: "VTUBER ID カード" },
  "Welcome back — sign in to your account": {
    ko: "다시 오신 것을 환영합니다 — 계정에 로그인하세요",
    es: "Bienvenido de nuevo — inicia sesión en tu cuenta",
    ja: "おかえりなさい — アカウントにサインインしてください",
  },
  "What's on your mind?": { ko: "무슨 생각을 하고 계신가요?", es: "¿Qué estás pensando?", ja: "いま何してる？" },
  "Your name here": { ko: "여기에 이름 입력", es: "Tu nombre aquí", ja: "ここに名前を入力" },
  "Your Name Here": { ko: "여기에 이름 입력", es: "Tu nombre aquí", ja: "ここに名前を入力" },
};

function tr(s: string, lang: Target): string {
  return PRESET_TEXT[s]?.[lang] ?? s;
}

// Recursively translate the user-facing text props of a built panel tree. Slot
// names and all non-text props are untouched; nodes whose text is unchanged are
// shared by reference (no needless cloning). No-op for English.
export function localizePanelText(root: Slot, lang: Lang): Slot {
  if (lang === "en") return root;
  const target = lang as Target;

  function mapComp(comp: UixComponent): UixComponent {
    const p = comp.props as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    const put = (k: string, v: string) => {
      if (!next) next = { ...p };
      next[k] = v;
    };
    const tryKey = (k: string) => {
      const v = p[k];
      if (typeof v === "string" && v.trim()) {
        const t = tr(v, target);
        if (t !== v) put(k, t);
      }
    };

    if (comp.type === "Text") {
      tryKey("content");
    } else if (comp.type === "Popup") {
      tryKey("title");
      tryKey("body");
      tryKey("dismissLabel");
    } else if (comp.type === "TextField") {
      tryKey("textContent");
      tryKey("placeholder");
    } else if (comp.type === "Dropdown" && typeof p.options === "string") {
      const opts = (p.options as string).split("\n").map((l) => tr(l, target)).join("\n");
      if (opts !== p.options) put("options", opts);
    }

    return next ? { ...comp, props: next } : comp;
  }

  function mapSlot(slot: Slot): Slot {
    const components = slot.components.map(mapComp);
    const children = slot.children.map(mapSlot);
    const compsChanged = components.some((c, i) => c !== slot.components[i]);
    const kidsChanged = children.some((c, i) => c !== slot.children[i]);
    return compsChanged || kidsChanged ? { ...slot, components, children } : slot;
  }

  return mapSlot(root);
}
