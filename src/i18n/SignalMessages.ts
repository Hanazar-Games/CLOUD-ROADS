export const signalMessages = `红绿灯与交规提醒	Traffic signals & road rules	信号と交通ルール	신호등과 교통 규칙	Semáforos y normas de tráfico
在世界与道路中启用信号十字路口。NPC 与控速自动驾驶会等待信号；仅控方向时仍需自行刹车。转弯须让行，暂不模拟行人信号与独立左转相位。	Enable signal intersections in World & roads. NPCs and speed assistance stop at signals; steering-only mode requires manual braking. Yield when turning. Pedestrian signals and protected left turns are not simulated.	ワールドと道路で信号交差点を有効にします。NPC と速度補助は信号で停止。操舵のみの場合は手動制動が必要です。右左折時は譲ってください。歩行者信号と専用左折現示は未対応です。	월드와 도로에서 신호 교차로를 켜세요. NPC와 속도 보조는 신호에 정차합니다. 조향 전용 모드에서는 직접 제동해야 합니다. 회전 시 양보하세요. 보행자 신호와 좌회전 전용 신호는 지원하지 않습니다.	Activa los cruces con semáforos en Mundo y carreteras. Los NPC y la asistencia de velocidad se detienen; con solo dirección debes frenar. Cede al girar. No se simulan señales peatonales ni giros izquierdos protegidos.
主路绿灯时间	Main-road green time	本線の青信号時間	주도로 녹색 시간	Verde de vía principal
支路绿灯时间	Cross-road green time	交差道路の青信号時間	교차 도로 녹색 시간	Verde de vía transversal
黄灯时间	Yellow time	黄信号時間	황색 시간	Duración del amarillo
全红清空时间	All-red clearance time	全赤クリアランス時間	전 방향 적색 시간	Despeje con todo en rojo
主路两个方向同时放行；越长主路越顺畅，但支路等待更久。	Both main-road directions proceed together. Longer green helps the main road but increases cross-road waiting.	本線の両方向を同時に通します。長いほど本線が流れますが交差道路の待ち時間が増えます。	주도로 양방향이 함께 통행합니다. 길수록 주도로 흐름은 좋아지지만 교차 도로 대기가 늘어납니다.	Ambos sentidos de la vía principal avanzan juntos. Más verde mejora su flujo, pero alarga la espera transversal.
交叉方向的通行时间，默认较短。	Green time for the crossing direction; short by default.	交差方向の通行時間。初期値は短めです。	교차 방향의 통행 시간입니다. 기본값은 짧습니다.	Tiempo de paso transversal; breve por defecto.
黄灯时能安全停车的车辆会停车；过近时继续清空路口。黄灯不判闯红灯。	Vehicles stop on yellow when safe, or clear the junction if too close. Yellow does not trigger a red-light warning.	黄信号で安全に止まれる車は停止し、近すぎる車は通過します。黄信号では赤信号違反にしません。	황색에 안전하게 멈출 수 있으면 정차하고 너무 가까우면 교차로를 통과합니다. 황색 통과는 적색 위반으로 보지 않습니다.	En amarillo se frena si es seguro; los vehículos demasiado cerca despejan el cruce. El amarillo no genera aviso por rojo.
切换方向前让两个方向都亮红灯。长车较多时可适当增加。修改配时后先全红，再恢复周期。	Both directions turn red before switching. Increase for long vehicles. Timing changes begin with all-red before the cycle resumes.	方向切替前に両方を赤にします。長い車が多い場合は延長できます。配時変更後は全赤を挟み再開します。	방향 전환 전에 양쪽을 적색으로 바꿉니다. 긴 차량이 많으면 늘리세요. 시간 변경 후에는 전 방향 적색을 거쳐 주기를 재개합니다.	Ambas vías quedan en rojo antes del cambio. Aumenta con vehículos largos. Al cambiar tiempos se aplica todo rojo antes de reanudar el ciclo.
显示前方信号倒计时	Show signal countdown	前方信号の残り時間を表示	전방 신호 남은 시간 표시	Mostrar cuenta atrás
开启交通违规提醒	Enable traffic rule reminders	交通違反の注意表示を有効化	교통 위반 알림 켜기	Activar avisos de infracciones
提醒闯红灯	Warn on red-light crossings	赤信号での進入を通知	적색 신호 위반 알림	Avisar al pasar en rojo
提醒持续超速	Warn on sustained speeding	継続した速度超過を通知	지속 과속 알림	Avisar de exceso sostenido
提醒限速	Reminder speed limit	注意表示の制限速度	알림 기준 제한 속도	Límite para avisos
超速容差	Speed tolerance	速度超過の許容幅	과속 허용 오차	Tolerancia de velocidad
提醒显示时长	Reminder duration	注意表示の時間	알림 표시 시간	Duración del aviso
超速重复提醒间隔	Speed reminder interval	速度注意の再表示間隔	과속 알림 반복 간격	Intervalo entre avisos
仅用于玩家超速提醒；不改变车辆最高速度或 NPC 巡航速度。连续超速两秒后提醒。	Only controls player speeding reminders, not vehicle or NPC speed. Warns after two seconds of speeding.	プレイヤーへの注意表示のみ。車両や NPC の速度は変えません。2 秒間の速度超過で通知します。	플레이어 과속 알림에만 적용되며 차량 최고 속도나 NPC 속도는 바꾸지 않습니다. 2초간 과속하면 알립니다.	Solo afecta al aviso al jugador, no a la velocidad del vehículo ni de los NPC. Avisa tras dos segundos de exceso.
车速超过提醒限速加此容差时，才开始计算持续超速。	Sustained speeding starts counting above the limit plus this tolerance.	制限速度にこの許容幅を加えた値を超えてから継続時間を計測します。	알림 제한 속도에 허용 오차를 더한 값을 넘어야 과속 지속 시간을 셉니다.	El exceso sostenido se cuenta al superar el límite más esta tolerancia.
提醒不罚款、不强制制动，仅在驾驶时记录。关闭总开关立即隐藏提醒，NPC 仍遵守信号；暂停、换世界与重新放置车辆不会产生越线处罚。	Reminders impose no fines or forced braking and only track driving. Disabling hides them immediately; NPCs still obey signals. Pausing, changing worlds and repositioning do not count as crossings.	注意表示のみで罰金や強制制動はなく、運転中だけ判定します。無効にすると即座に非表示。NPC は信号を守ります。一時停止、ワールド変更、再配置は越線に数えません。	운전 중에만 판단하며 벌금이나 강제 제동은 없습니다. 끄면 즉시 숨겨지지만 NPC는 계속 신호를 지킵니다. 일시정지, 월드 변경, 차량 재배치는 위반으로 세지 않습니다.	Los avisos no multan ni frenan y solo registran al conducir. Al desactivarlos se ocultan; los NPC respetan las señales. Pausas, cambios de mundo y recolocación no cuentan como cruces.
启用信号十字路口	Enable signal intersections	信号付き交差点を有効化	신호 교차로 켜기	Activar cruces con semáforos
十字路口目标间隔 · km	Target intersection spacing · km	交差点の目標間隔 · km	교차로 목표 간격 · km	Separación entre cruces · km
仅双向山路与景观大道生效，替代原分支匝道。桥梁、隧道、服务区和过陡地形会跳过，因此实际间距可能更大。应用后重新生成。	For two-way mountain roads and avenues, replacing branch ramps. Bridges, tunnels, services and steep terrain are skipped, so actual gaps can be larger. Apply to regenerate.	双方向の山道と大通りで支道ランプを置換します。橋、トンネル、SA、急地形は避けるため実際の間隔は広がる場合があります。適用で再生成。	양방향 산길과 대로에서 기존 분기 램프를 대체합니다. 교량, 터널, 휴게소와 급경사는 건너뛰므로 실제 간격은 더 길 수 있습니다. 적용하면 다시 생성합니다.	Para carreteras de montaña y avenidas de doble sentido; sustituye ramales. Se omiten puentes, túneles, servicios y pendientes fuertes, por lo que la separación real puede aumentar. Aplica para regenerar.
开启后使用四向平面路口，转入支路后继续无限生成。高速与单向道路保留原匝道；信号配时与违规提醒在 NPC 交通分类调整。	Enables four-way level junctions; branches keep generating endlessly. Highways and one-way roads retain ramps. Adjust timing and reminders under NPC traffic.	四方向の平面交差点を使用し、支道も無限生成します。高速と一方通行は従来のランプを維持。信号時間と注意表示は NPC 交通で調整します。	네 방향 평면 교차로를 사용하며 분기 도로도 무한 생성됩니다. 고속도로와 일방통행로는 기존 램프를 유지합니다. 시간과 알림은 NPC 교통에서 조절하세요.	Activa cruces a nivel de cuatro direcciones; los ramales siguen generándose. Autopistas y vías de un sentido mantienen rampas. Ajusta tiempos y avisos en Tráfico NPC.
主路红灯	Main-road red	本線赤信号	주도로 적색	Rojo principal
支路红灯	Cross-road red	交差道路赤信号	교차 도로 적색	Rojo transversal
交通提醒：已越过红灯停止线，请注意路口车辆。	Traffic reminder: crossed the stop line on red. Watch for crossing traffic.	交通注意：赤信号の停止線を越えました。交差する車両に注意してください。	교통 알림: 적색 신호에 정지선을 넘었습니다. 교차 차량에 주의하세요.	Aviso: has cruzado la línea en rojo. Cuidado con el tráfico transversal.
交通提醒：持续超速，当前限速	Traffic reminder: sustained speeding. Limit	交通注意：速度超過が継続。制限速度	교통 알림: 과속이 지속됩니다. 제한 속도	Aviso: exceso de velocidad sostenido. Límite
。请平稳减速。	. Slow down smoothly.	。穏やかに減速してください。	. 부드럽게 감속하세요.	. Reduce suavemente.
红灯停车	Red · stop	赤 · 停止	적색 · 정지	Rojo · detenerse
黄灯谨慎停车	Yellow · stop if safe	黄 · 安全なら停止	황색 · 안전하면 정지	Amarillo · frena si es seguro
绿灯通行	Green · proceed	青 · 進行	녹색 · 통행	Verde · avanzar
信号灯 · 减速等待	Signal · slowing to wait	信号 · 減速して待機	신호 · 감속 후 대기	Semáforo · frenando para esperar
信号灯 · 请自行制动	Signal · brake manually	信号 · 手動で制動してください	신호 · 직접 제동하세요	Semáforo · frena manualmente
下一信号路口	Next signal intersection	次の信号交差点	다음 신호 교차로	Próximo cruce con semáforos
信号十字路口 · 四向连接	Signal intersection · four-way connection	信号交差点 · 四方向接続	신호 교차로 · 네 방향 연결	Cruce con semáforos · cuatro direcciones
信号路口目标间隔	Target signal spacing	信号交差点の目標間隔	신호 교차로 목표 간격	Separación prevista de semáforos
不适合处跳过	Unsuitable sites skipped	不適切な地点は回避	부적합 지점은 건너뜀	Se omiten lugares inadecuados
未找到适合的信号路口，请降低山体密度或选择较平缓地形。	No suitable signal intersection found. Reduce mountain density or choose gentler terrain.	適した信号交差点が見つかりません。山の密度を下げるか緩やかな地形を選んでください。	적합한 신호 교차로를 찾지 못했습니다. 산 밀도를 낮추거나 완만한 지형을 선택하세요.	No se encontró un cruce adecuado. Reduce la densidad de montañas o elige terreno más suave.`;
