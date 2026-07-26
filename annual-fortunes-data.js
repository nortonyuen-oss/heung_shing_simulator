// Generated from docs/content/annual-fortunes.json. Keep the content source and runtime copy in sync.
const ANNUAL_FORTUNE_DATABASE = Object.freeze({
  "metadata": {
    "id": "heung-shing-annual-fortunes",
    "contentVersion": 2,
    "language": "zh-Hant",
    "status": "wired-runtime-source",
    "originality": "18支籤詩及所有遊戲文案均為《香城》原創；只參考傳統籤詩語氣及公有領域歷史／民間典故，不引用現代車公籤原文。",
    "fortuneCount": 18,
    "gradeCounts": {
      "upper": 6,
      "middle": 6,
      "lower": 6
    },
    "forumResponsesPerFortune": 3
  },
  "selectionModel": {
    "baselineWeights": {
      "upper": 0.36,
      "middle": 0.46,
      "lower": 0.18
    },
    "correlation": {
      "economyStress": {
        "expression": "clamp((50 - economyIndex) / 50, -0.60, 0.80)"
      },
      "stockCrashStress": {
        "expression": "stockCrashActive ? 0.55 : 0"
      },
      "epidemicStress": {
        "expression": "clamp(epidemicSeverity * 0.65, 0, 0.65)"
      },
      "totalStress": {
        "expression": "clamp(economyStress + stockCrashStress + epidemicStress, -0.60, 1.40)"
      },
      "upperWeight": {
        "expression": "clamp(0.36 - 0.07 * totalStress, 0.25, 0.42)"
      },
      "lowerWeight": {
        "expression": "clamp(0.18 + 0.08 * totalStress, 0.10, 0.30)"
      },
      "middleWeight": {
        "expression": "1 - upperWeight - lowerWeight"
      }
    },
    "noRepeatYears": 3,
    "process": "先按城市狀況調整上中下權重並抽等第，再從該等第排除最近三年籤號後等機率抽一支。"
  },
  "fortunes": [
    {
      "id": "heung-shing-01",
      "number": 1,
      "titleZh": "渭水逢賢",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "governance",
      "poem": [
        "磻溪垂釣待時來",
        "明主求賢下玉臺",
        "同德若能扶社稷",
        "東風萬里百花開"
      ],
      "allusion": {
        "titleZh": "姜太公渭水遇文王",
        "sourceTraditionZh": "《史記・齊太公世家》及後世民間傳說",
        "summaryZh": "姜太公隱居垂釣，等待能識其才的明主，最終遇上周文王。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，此籤反映香城廣納人才、上下同心，證明政府現行管治方向得到傳統文化正面肯定；人才何時上臺則須按既定程序輪候。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，太公等嘅係識人之主，唔係多一個招聘網站。上籤講求用人唯才，如果淨係用識人之才，東風都會變冷氣。"
      },
      "forumResponses": [
        {
          "author": "政府工合約仔",
          "textZh": "廣納人才係指公開招聘，最後請返署任咗八年嗰位？"
        },
        {
          "author": "釣魚台常客",
          "textZh": "姜太公起碼真係等到文王，我等公屋等到個仔都識釣魚。"
        },
        {
          "author": "香城打工仔",
          "textZh": "收藏先，年尾睇吓百花開，定係得會展中心啲膠花開。"
        }
      ]
    },
    {
      "id": "heung-shing-02",
      "number": 2,
      "titleZh": "霧江借箭",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "transport",
      "poem": [
        "江霧沉沉鎖戰船",
        "草人無語立船邊",
        "若能借勢收千箭",
        "不費弓弦亦凱旋"
      ],
      "allusion": {
        "titleZh": "草船借箭",
        "sourceTraditionZh": "《三國演義》民間故事",
        "summaryZh": "諸葛亮利用江霧與敵軍疑心，以草船取得大量箭矢。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官認為籤文顯示香城善用區域協作與現有資源，基建可以少花力氣、多取成果；政府將研究更多毋須自己造箭的創新融資模式。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，借勢唔等於借完唔還，江霧亦唔係成本效益分析。識睇風向係本事，將每次大霧都當政策成功就係近視。"
      },
      "forumResponses": [
        {
          "author": "隧道塞車苦主",
          "textZh": "可唔可以借隔離城市條路用？我哋自己嗰條朝早已經插滿箭。"
        },
        {
          "author": "庫房關注組",
          "textZh": "「創新融資」四個字一出，我已經感到銀包附近有霧。"
        },
        {
          "author": "草船外賣員",
          "textZh": "不費弓弦可以，最後唔好收返我過海隧道費就得。"
        }
      ]
    },
    {
      "id": "heung-shing-03",
      "number": 3,
      "titleZh": "九河歸海",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "transport",
      "poem": [
        "九派洪流入海長",
        "三門既鑿水安鄉",
        "公心若使民同力",
        "沃野年年稻穀香"
      ],
      "allusion": {
        "titleZh": "大禹治水",
        "sourceTraditionZh": "《尚書》、《史記・夏本紀》等傳說",
        "summaryZh": "大禹以疏導代替堵塞，歷經多年治理洪水。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，上籤肯定政府疏導交通、排水及跨區基建工作，只要社會同心，香城各項水道與道路都會暢通；現時塞車屬工程邁向暢通前的必要階段。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，大禹治水係落水做，唔係喺會議室畫水。堵住嘅地方要疏，唔好每次水浸先研究雨水點解由天跌落嚟。"
      },
      "forumResponses": [
        {
          "author": "低窪區街坊",
          "textZh": "稻穀香未聞到，渠口嗰陣味就每逢大雨準時報到。"
        },
        {
          "author": "工程顧問報告讀者",
          "textZh": "大禹三過家門而不入，香城工程就三次超支而未入正題。"
        },
        {
          "author": "海旁散步人士",
          "textZh": "希望「洪流入海」講緊雨水，唔係庫房啲錢。"
        }
      ]
    },
    {
      "id": "heung-shing-04",
      "number": 4,
      "titleZh": "投筆萬里",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "educationScience",
      "poem": [
        "書案塵封劍氣揚",
        "孤身萬里拓邊疆",
        "敢將志業從頭起",
        "終見旌旗映日光"
      ],
      "allusion": {
        "titleZh": "班超投筆從戎",
        "sourceTraditionZh": "《後漢書・班超傳》",
        "summaryZh": "班超不甘長期抄書，投筆從軍，後來建功西域。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，籤文鼓勵青年突破框架、投身新產業，政府將繼續資助創科人才從頭起步；至於資助表格仍須由頭填到尾。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，投筆係改行做實事，唔係將枝筆掟畀顧問。上籤畀有志者，唔畀只識將「創新」兩字放大三十號字體嘅人。"
      },
      "forumResponses": [
        {
          "author": "科學園外賣員",
          "textZh": "拓邊疆之前可唔可以先拓闊科學園午飯時間條車龍？"
        },
        {
          "author": "大學生未還貸款",
          "textZh": "政府叫青年敢於從頭起，我個銀行戶口一直都係由零開始。"
        },
        {
          "author": "太陽能電筒用家",
          "textZh": "只要唔係再資助夜晚冇用、日頭唔需要嘅發明，我支持。"
        }
      ]
    },
    {
      "id": "heung-shing-05",
      "number": 5,
      "titleZh": "五湖知退",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "economy",
      "poem": [
        "陶朱散聚識盈虛",
        "功遂輕舟出五湖",
        "財取有方民自富",
        "潮平商舶滿城都"
      ],
      "allusion": {
        "titleZh": "范蠡功成身退",
        "sourceTraditionZh": "《史記・越王勾踐世家》、《貨殖列傳》及後世傳說",
        "summaryZh": "范蠡助越王復國後功成身退，經商致富而被尊為陶朱公。"
      },
      "governmentInterpretation": {
        "officialId": "treasury_head",
        "officialNameZh": "財政司長",
        "textZh": "財政司長表示，籤文反映資本有序流動、商貿興旺，只要審慎理財，庫房與民間都可受惠；政府會特別研究「散聚」中由市民散、庫房聚的技術細節。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，陶朱公最叻唔係發達，係知道幾時收手。賺到盡再話市場自行調節，通常調節嘅係小市民三餐。"
      },
      "forumResponses": [
        {
          "author": "街市經濟學家",
          "textZh": "財取有方我明，點解每次個方都指向新收費？"
        },
        {
          "author": "失眠中產",
          "textZh": "商舶滿城都幾好，前提係唔好全部運緊樓價同租金上岸。"
        },
        {
          "author": "納稅人阿明",
          "textZh": "范蠡功成身退，香城官員通常係功未成、約先續。"
        }
      ]
    },
    {
      "id": "heung-shing-06",
      "number": 6,
      "titleZh": "木蘭歸燈",
      "grade": "upper",
      "gradeZh": "上籤",
      "theme": "publicSafety",
      "poem": [
        "木蘭策馬過關山",
        "卸甲歸來月正彎",
        "眾志能將危局定",
        "千家燈火照人間"
      ],
      "allusion": {
        "titleZh": "木蘭從軍",
        "sourceTraditionZh": "北朝民歌《木蘭辭》及民間傳說",
        "summaryZh": "木蘭代父從軍，歷戰多年後平安歸家。"
      },
      "governmentInterpretation": {
        "officialId": "police_head",
        "officialNameZh": "警務處長",
        "textZh": "警務處長表示，此籤象徵香城各部門同心守護家園，治安與應變能力足以令萬家燈火安穩；大型活動的路障安排亦會繼續以燈火數量計算成效。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，木蘭打完仗識卸甲返屋企，最難得係唔將臨時措施當永久制服。守城為民，唔好守到市民行唔到入城。"
      },
      "forumResponses": [
        {
          "author": "夜更巴士乘客",
          "textZh": "千家燈火有我屋企一盞，因為尾班車未到，我仲未返到去熄燈。"
        },
        {
          "author": "樓下保安",
          "textZh": "木蘭一個人做咁多，換成香城應該要先成立六個統籌委員會。"
        },
        {
          "author": "屋邨互助會",
          "textZh": "平安上籤收下，但臨時封路牌可唔可以活動完真係卸甲？"
        }
      ]
    },
    {
      "id": "heung-shing-07",
      "number": 7,
      "titleZh": "塞上失馬",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "economy",
      "poem": [
        "塞上驚聞駿馬逃",
        "歸來胡騎滿山皋",
        "禍福轉輪難早定",
        "持心穩步莫徒勞"
      ],
      "allusion": {
        "titleZh": "塞翁失馬",
        "sourceTraditionZh": "《淮南子・人間訓》",
        "summaryZh": "塞翁失馬後反得良馬，禍福互相轉化，難以一時判定。"
      },
      "governmentInterpretation": {
        "officialId": "treasury_head",
        "officialNameZh": "財政司長",
        "textZh": "財政司長表示，中籤證明市場短期波動不代表基本面轉差，資產流走亦可能帶來更大機遇；市民應保持耐性，尤其在政府仍未完成最新預測之前。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，失馬可以變好事，但唔代表每次蝕錢都值得鼓掌。禍福未定，所以更要睇實馬房，唔係將門打開再講長線。"
      },
      "forumResponses": [
        {
          "author": "股票戶口剩餘價值",
          "textZh": "股市跌叫短期波動，升返一日就叫歷史性復甦，馬跑得真快。"
        },
        {
          "author": "強積金長期觀眾",
          "textZh": "我隻馬走咗十年都未帶胡騎返嚟，可能塞緊海底隧道。"
        },
        {
          "author": "茶餐廳搭枱客",
          "textZh": "中籤翻譯：好壞未定，但加價通常先定。"
        }
      ]
    },
    {
      "id": "heung-shing-08",
      "number": 8,
      "titleZh": "圯橋拾履",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "governance",
      "poem": [
        "圯橋拾履曉風寒",
        "三進方傳一卷丹",
        "大事未成先忍氣",
        "守時終可渡長灘"
      ],
      "allusion": {
        "titleZh": "張良圯橋進履",
        "sourceTraditionZh": "《史記・留侯世家》",
        "summaryZh": "張良多次替老人拾鞋並守約赴會，通過考驗後獲授兵書。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，籤文強調耐性、守時與接受考驗，政府大型計劃即使多次延期，亦屬通往成功前的必要磨練。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，張良係自己早到，唔係叫全城市民等一個遲到十年嘅工程。忍氣有期限，守時係雙方，唔好淨係要求市民守。"
      },
      "forumResponses": [
        {
          "author": "等車等到入定",
          "textZh": "守時終可渡長灘，請將呢句貼喺巴士公司控制室。"
        },
        {
          "author": "工程延期關注組",
          "textZh": "原來三次延期係圯橋考驗，我誤會咗係管理問題。"
        },
        {
          "author": "香城打工仔",
          "textZh": "我返工遲三分鐘扣錢，政府工程遲三年就傳我一卷新時間表。"
        }
      ]
    },
    {
      "id": "heung-shing-09",
      "number": 9,
      "titleZh": "負荊和將",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "governance",
      "poem": [
        "將相爭鋒國勢危",
        "負荊一謝是良規",
        "若能退步留餘地",
        "半失顏容百事宜"
      ],
      "allusion": {
        "titleZh": "廉頗負荊請罪",
        "sourceTraditionZh": "《史記・廉頗藺相如列傳》",
        "summaryZh": "廉頗明白大局後向藺相如負荊請罪，二人和好共同護國。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官稱中籤提醒社會放下分歧、顧全大局，政府樂意接受建設性意見；至於公開道歉，須先研究會否造成不良先例。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，負荊最重要係認錯，唔係背住盆栽影張相。肯退一步先有路，如果每次都話自己冇錯，條路幾闊都會撞牆。"
      },
      "forumResponses": [
        {
          "author": "公關稿校對員",
          "textZh": "「對事件表示遺憾」唔算負荊，最多算負責讀稿。"
        },
        {
          "author": "屋邨互助會",
          "textZh": "半失顏容換百事宜其實幾抵，問題係有啲人面皮值成個庫房。"
        },
        {
          "author": "廟口花生友",
          "textZh": "期待官員負荊，估計最後由下屬負責、官員輕裝。"
        }
      ]
    },
    {
      "id": "heung-shing-10",
      "number": 10,
      "titleZh": "移山微土",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "transport",
      "poem": [
        "門前兩岳蔽晨暉",
        "一擔沙泥逐日微",
        "莫問今朝山未動",
        "子孫接力見雲飛"
      ],
      "allusion": {
        "titleZh": "愚公移山",
        "sourceTraditionZh": "《列子・湯問》",
        "summaryZh": "愚公決心世代挖走阻路高山，以長久毅力克服巨大障礙。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，中籤肯定基建必須有長遠眼光，即使今天未見成果，下一代終會受惠；工程融資亦會很有長遠眼光地留給下一代。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，愚公日日真係搬泥，唔係日日更新工程口號。長遠計劃要每年見少少山，唔係只見預算愈來愈高。"
      },
      "forumResponses": [
        {
          "author": "第三代輪候居民",
          "textZh": "子孫接力我熟，我阿爺申請、我老豆補文件、而家輪到我更新地址。"
        },
        {
          "author": "基建攝影愛好者",
          "textZh": "山未動但圍板每年換新色，亦算城市景觀持續更新。"
        },
        {
          "author": "納稅人阿明",
          "textZh": "下一代會見雲飛，順便見到今代留下嘅債券到期。"
        }
      ]
    },
    {
      "id": "heung-shing-11",
      "number": 11,
      "titleZh": "換駟成局",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "governance",
      "poem": [
        "上駟相逢未可爭",
        "調籌換序局中生",
        "勝負但憑長短配",
        "勿將一役定枯榮"
      ],
      "allusion": {
        "titleZh": "田忌賽馬",
        "sourceTraditionZh": "《史記・孫子吳起列傳》",
        "summaryZh": "孫臏替田忌調整馬匹出賽次序，以整體策略取得勝利。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官認為，中籤鼓勵政府靈活調配資源，不應以單一指標判斷成敗；因此表現欠佳的指標將與表現較佳的指標重新排列展示。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，田忌換次序係因為知每匹馬快慢，唔係輸咗就換統計表次序。調配要識取捨，唔可以每一場都宣布自己精神上勝出。"
      },
      "forumResponses": [
        {
          "author": "統計表最後一行",
          "textZh": "指標重新排列之後，我由倒數第一變成由下數起最具潛力。"
        },
        {
          "author": "賽馬日散戶",
          "textZh": "田忌至少知道自己邊匹係下駟，政府通常全部都包裝成千里馬。"
        },
        {
          "author": "香城家長",
          "textZh": "勿將一役定枯榮，請教育局下次派成績表時一併提醒家長。"
        }
      ]
    },
    {
      "id": "heung-shing-12",
      "number": 12,
      "titleZh": "北海持節",
      "grade": "middle",
      "gradeZh": "中籤",
      "theme": "governance",
      "poem": [
        "北海風高雁影稀",
        "孤臣持節雪沾衣",
        "長夜未明心莫改",
        "守正雖遲終有歸"
      ],
      "allusion": {
        "titleZh": "蘇武牧羊",
        "sourceTraditionZh": "《漢書・蘇武傳》",
        "summaryZh": "蘇武出使被扣多年，始終持節不屈，最後返回漢朝。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，此籤反映香城面對外圍逆風仍會堅守原則，中長期前景審慎樂觀；「中長期」的實際長度會視乎短期情況調整。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，蘇武守嘅係節，唔係守住一個明知唔得嘅KPI。堅持同固執差一個肯唔肯聽人講真話。"
      },
      "forumResponses": [
        {
          "author": "外圍因素本人",
          "textZh": "又係我？香城啲內圍因素幾時肯出嚟見記者？"
        },
        {
          "author": "凍薪第六年",
          "textZh": "守正雖遲終有歸，希望我份加薪都識認路返嚟。"
        },
        {
          "author": "北區通勤苦主",
          "textZh": "長夜未明心莫改，尾班車未到站都可以用。"
        }
      ]
    },
    {
      "id": "heung-shing-13",
      "number": 13,
      "titleZh": "烏江夜歌",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "governance",
      "poem": [
        "垓下歌殘夜漏深",
        "烏江浪急失人心",
        "剛強若不容忠諫",
        "百戰功名一夕沉"
      ],
      "allusion": {
        "titleZh": "項羽垓下敗走烏江",
        "sourceTraditionZh": "《史記・項羽本紀》",
        "summaryZh": "項羽剛愎自用、失去人心，垓下兵敗後走至烏江。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，下籤提醒管治團隊必須廣納忠言，政府一直設有多個諮詢渠道；至於渠道收到的意見為何全部相近，反映社會高度共識。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，項羽唔係輸一場先輸，係一路聽唔入耳先輸到烏江。有人講真話就話唱衰，最後只會剩返自己唱歌。"
      },
      "forumResponses": [
        {
          "author": "諮詢會最後一排",
          "textZh": "我填咗反對，報告最後寫「大部分意見支持並提出改善建議」。原來我支持咗。"
        },
        {
          "author": "公屋天台觀察員",
          "textZh": "失人心最方便嘅解決方法係停止公布民心指數。"
        },
        {
          "author": "廟口花生友",
          "textZh": "祥叔講完忠諫，明年可能要先抽籤決定邊個有資格解籤。"
        }
      ]
    },
    {
      "id": "heung-shing-14",
      "number": 14,
      "titleZh": "紙營空鼓",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "publicSafety",
      "poem": [
        "紙上談兵勢若虹",
        "長平一役萬營空",
        "未經實地休誇口",
        "虛策難迎四面風"
      ],
      "allusion": {
        "titleZh": "趙括紙上談兵",
        "sourceTraditionZh": "《史記・廉頗藺相如列傳》及後世成語傳說",
        "summaryZh": "趙括熟讀兵書卻缺乏實戰經驗，長平之戰大敗。"
      },
      "governmentInterpretation": {
        "officialId": "police_head",
        "officialNameZh": "警務處長",
        "textZh": "警務處長表示，下籤提醒各部門加強演練與實地經驗，現有應變方案均經嚴格桌上推演，下一步會研究如何證明桌上推演不只在桌上。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，讀熟本手冊唔代表識救火，簡報上全部綠燈亦唔代表街上冇事。未落過場，就唔好先印勝利報告。"
      },
      "forumResponses": [
        {
          "author": "演習被困居民",
          "textZh": "上次演習最大成果係證明警報器真係可以嚇親全區。"
        },
        {
          "author": "顧問報告讀者",
          "textZh": "四面風嚟到之前，建議將份風險評估由機密改成防水。"
        },
        {
          "author": "樓下保安",
          "textZh": "紙上談兵起碼有兵，我哋大廈走火演習得一張貼紙。"
        }
      ]
    },
    {
      "id": "heung-shing-15",
      "number": 15,
      "titleZh": "守株荒田",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "economy",
      "poem": [
        "枯株抱守夕陽斜",
        "一兔曾來撞樹椏",
        "若把偶然當定例",
        "荒田終歲少桑麻"
      ],
      "allusion": {
        "titleZh": "守株待兔",
        "sourceTraditionZh": "《韓非子・五蠹》",
        "summaryZh": "農夫偶然撿到撞樹而死的兔子，從此放棄耕作守候同樣好運。"
      },
      "governmentInterpretation": {
        "officialId": "treasury_head",
        "officialNameZh": "財政司長",
        "textZh": "財政司長表示，下籤警示香城不能依賴單一產業與偶然收益，政府會推動多元經濟，包括再成立一個研究如何減少依賴研究報告的基金。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，兔撞一次係運，年年坐喺樹下係懶。樓市、旅遊或者股市旺過一次，都唔代表可以荒晒其他田。"
      },
      "forumResponses": [
        {
          "author": "街市經濟學家",
          "textZh": "多元經濟：樓、豪宅、服務式住宅同附設商場嘅樓。"
        },
        {
          "author": "發達夢未醒",
          "textZh": "我守咗股票十年，兔冇嚟，棵樹就俾管理費公司斬咗。"
        },
        {
          "author": "科學園外賣員",
          "textZh": "荒田少桑麻，但研究基金申請表收成非常豐富。"
        }
      ]
    },
    {
      "id": "heung-shing-16",
      "number": 16,
      "titleZh": "烽臺失信",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "publicSafety",
      "poem": [
        "烽火連臺戲諸侯",
        "千金一笑失同謀",
        "公信一朝隨火盡",
        "危城無援悔難收"
      ],
      "allusion": {
        "titleZh": "烽火戲諸侯",
        "sourceTraditionZh": "《史記・周本紀》及後世傳說",
        "summaryZh": "周幽王為博褒姒一笑濫點烽火，失去諸侯信任，真正遇敵時無人來援。"
      },
      "governmentInterpretation": {
        "officialId": "police_head",
        "officialNameZh": "警務處長",
        "textZh": "警務處長表示，下籤提醒市民重視官方警報，政府會確保每次訊息準確可信；過往誤報屬系統測試，證明系統在誤報功能上運作正常。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，警鐘亂敲幾次，真有火都冇人信。公信唔係記者會講返嚟，係每次唔呃人慢慢儲返嚟。"
      },
      "forumResponses": [
        {
          "author": "手機警報受害者",
          "textZh": "半夜三點測試成功，我全家、公仔同樓下隻狗都確認收到。"
        },
        {
          "author": "香城師奶",
          "textZh": "政府叫我信官方消息，官方消息就叫我留意稍後官方消息。"
        },
        {
          "author": "夜更巴士乘客",
          "textZh": "烽火唔好亂點，巴士到站時間都唔好亂寫。"
        }
      ]
    },
    {
      "id": "heung-shing-17",
      "number": 17,
      "titleZh": "指鹿封言",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "governance",
      "poem": [
        "朝堂指鹿作良駒",
        "眾口噤聲是可虞",
        "若使真言沉殿外",
        "高牆終被暗潮驅"
      ],
      "allusion": {
        "titleZh": "趙高指鹿為馬",
        "sourceTraditionZh": "《史記・秦始皇本紀》",
        "summaryZh": "趙高故意把鹿說成馬，以測試並排除不肯附和的大臣。"
      },
      "governmentInterpretation": {
        "officialId": "chief_executive",
        "officialNameZh": "行政長官",
        "textZh": "行政長官表示，下籤提醒社會辨明事實，政府一向以客觀數據為依歸；任何與官方數據不同的體感，當局都會尊重其主觀存在。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，鹿就係鹿，叫一百個人拍手都唔會變馬。最危險唔係有人講大話，係全屋人都知但唔敢出聲。"
      },
      "forumResponses": [
        {
          "author": "統計表最後一行",
          "textZh": "我體感百物騰貴，數據話升幅溫和，可能我買餸姿勢唔夠客觀。"
        },
        {
          "author": "動物分類關注組",
          "textZh": "本會確認鹿同馬仍屬不同動物，等待政府成立專組覆核。"
        },
        {
          "author": "香城打工仔",
          "textZh": "真言沉殿外，留言區就負責做排水渠。"
        }
      ]
    },
    {
      "id": "heung-shing-18",
      "number": 18,
      "titleZh": "連環東火",
      "grade": "lower",
      "gradeZh": "下籤",
      "theme": "publicSafety",
      "poem": [
        "連環戰舶蔽江津",
        "一炬東風化作塵",
        "自恃兵多輕水火",
        "回頭方覺岸無人"
      ],
      "allusion": {
        "titleZh": "赤壁火攻與連環船",
        "sourceTraditionZh": "赤壁之戰史事及《三國演義》民間敘事",
        "summaryZh": "曹軍把船連鎖以求穩定，卻在火攻與東風下陷入大敗。"
      },
      "governmentInterpretation": {
        "officialId": "police_head",
        "officialNameZh": "警務處長",
        "textZh": "警務處長表示，下籤提醒大型系統不能只追求表面穩定，政府會全面檢視相互依賴風險；各部門將繼續緊密扣連，直至檢視完成。"
      },
      "templeKeeperInterpretation": {
        "speakerId": "temple_keeper_cheung",
        "speakerNameZh": "廟祝祥叔",
        "textZh": "祥叔話，連埋一齊睇落穩，燒起上嚟都會一齊燒。雞蛋唔好放一籃，船唔好鎖一串，責任更加唔好鎖死喺最下級。"
      },
      "forumResponses": [
        {
          "author": "系統維護外判員",
          "textZh": "全部系統共用一個登入，一個死全城陪葬，設計上非常團結。"
        },
        {
          "author": "海旁散步人士",
          "textZh": "東風一到先研究防火，香城速度依然領先火勢半步。"
        },
        {
          "author": "庫房關注組",
          "textZh": "岸無人唔緊要，岸上應該已經預留咗顧問辦公室。"
        }
      ]
    }
  ]
});
