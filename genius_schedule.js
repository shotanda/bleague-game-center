// 検証用
//const endpointUrl = "http://dev-bleague.s3.amazonaws.com/web_json/v2_genius_contexts/";
// 本番用
const endpointUrl = "http://b-league.s3.amazonaws.com/web_json/v2_genius_contexts/";

function schedule_get_contexts(renderFunc) {
    Object.keys(schedule_contexts).forEach((scheduleKey) => {
        const context = schedule_contexts[scheduleKey];

        if (context.Game.GameDateTime * 1000 < Date.now()) {
            getLastId(scheduleKey, renderFunc);
        } else {
            context.maxId = null;
            renderFunc(scheduleKey, null);

            context.timerId = setInterval(getScheduleContext, 30 * 1000, scheduleKey, renderFunc);
        }
    });
}

function schedule_clear_contexts() {
    Object.keys(schedule_contexts).forEach((scheduleKey) => {
        const context = schedule_contexts[scheduleKey];

        if (context.timerId) {
            clearInterval(context.timerId);
        }

        delete schedule_contexts[scheduleKey];
    });
}

function getLastId(scheduleKey, renderFunc) {
    const context = schedule_contexts[scheduleKey];

    $.ajax({
        url: endpointUrl + scheduleKey + "/latestid",
        dataType: "json"
    }).done(function (data, textStatus, jqXHR) {
        if (data != null && isFinite(data)) {
            context.maxId = data;
            getScheduleContext(scheduleKey, renderFunc);
        } else {
            context.maxId = null;
            renderFunc(scheduleKey, null);
        }

        if (!context.timerId) {
            context.timerId = setInterval(getScheduleContext, 30 * 1000, scheduleKey, renderFunc);
        }
    }).fail(function () {
        context.maxId = null;
        renderFunc(scheduleKey, null);

        if (!context.timerId) {
            context.timerId = setInterval(getScheduleContext, 30 * 1000, scheduleKey, renderFunc);
        }
    });
}

function getScheduleContext(scheduleKey, renderFunc) {
    const context = schedule_contexts[scheduleKey];


    if (context.maxId === null) {
        if (context.Game.GameDateTime * 1000 < Date.now()) {
            getLastId(scheduleKey, renderFunc);
        } else {
            renderFunc(scheduleKey, null);
        }
        return;
    }

    $.ajax({
        url: endpointUrl + scheduleKey + "/" + (context.maxId || 0) + ".json",
        dataType: "json"
    }).done(function (data, textStatus, jqXHR) {
        if (!data || !data.Game) {
            throw new TypeError('missing gamesummary');
        }

        // データの描画
        renderFunc(scheduleKey, data);

        //試合終了判定
        context.isFinal = (data.Game.GameEndedFlg === true && data.Game.RecordFixedFlg === true);
        if (context.isFinal === true) {
            //タイマー止める
            clearInterval(context.timerId);
            delete schedule_contexts[scheduleKey];
        } else {
            //max_idインクリメント
            context.maxId += 1;
        }
    }).fail(function (jqXHR, textStatus, errorThrown) {
        //エラーカウンタ
        if (context.maxId == 0) {
            context.errorCount = (context.errorCount || 0) + 1;
        }
        //リロード
        if (!!context.errorCount && context.errorCount > 10) {
            location.reload();
       }
    });
}

// スケジュールの更新
function renderSchedule(scheduleKey, data) {
    // 試合開始前
    if (data === null || schedule_contexts[scheduleKey].Game.GameDateTime * 1000 > Date.now()) {
        $('.list-item[id="' + scheduleKey + '"] div.info-scorestate').html('<span class="text-link"><span class="link-line">見どころ</span></span>');
        $('.list-item[id="' + scheduleKey + '"] a.data-game').attr('href', '/game_detail/?ScheduleKey=' + scheduleKey + '&tab=1');

        if (schedule_contexts[scheduleKey].Game.GameDateTime * 1000 < Date.now() + 60 * 10 * 1000) {
            $('.list-item[id="' + scheduleKey + '"] span.winner-link').remove();
        }

        return;
    }

    const game = data.Game;
    

    if (game.GameCurrentPeriod > 0) {
        let status = '試合前';

        if (!!game.PlayByPlayExistsFlg && game.PlayByPlayExistsFlg == true) {
            const periods = GeniusSchedule.getCurrentPeriodsByPlayByPlays(data.PlayByPlays, game.MaxPeriod);
            const playByPlays = data.PlayByPlays;
            let pbpLast;

            // クォーター名
            $.each(periods, function (index, value) {
                status = value[0];
            });

            (playByPlays || []).forEach(function (pbp) {
                if (pbpLast) {
                    if (pbp.Period >= pbpLast.Period) {
                        pbpLast = pbp;
                    }
                } else {
                    pbpLast = pbp;
                }
            });

            if (pbpLast.ActionCD1 == 81) {
                // 試合終了
                status = '試合終了';
            } else if (pbpLast.ActionCD1 == 83) {
                // ピリオドエンド
                if (pbpLast.Period == 2) {
                    status = 'ハーフタイム';
                } else {
                    status = status + " 残り " + pbpLast.RestTime;
                }
            } else {
                status = status + " 残り " + pbpLast.RestTime;
            }
        } else {
            const periodNames = ['1Q', '2Q', '3Q', '4Q', 'OT1', 'OT2', 'OT3', 'OT4'];
            const periodName = periodNames[game.GameCurrentPeriod - 1] || game.GameCurrentPeriod + 'Q';
            status = periodName;
            status2 = '<span class="scoreboard-match__title__quarter">' + periodName + '</span>';
        }

        // スコア
        if (game.HomeTeamScore !== null && game.AawyTeamScore !== null) {
            $('.list-item[id="' + game.ScheduleKey + '"] span.home-score').html('<span>' + game.HomeTeamScore + '</span>');
            $('.list-item[id="' + game.ScheduleKey + '"] span.away-score').html('<span>' + game.AwayTeamScore + '</span>');
            $('.list-item[id="' + game.ScheduleKey + '"] span.home-score').removeClass('gr');
            $('.list-item[id="' + game.ScheduleKey + '"] span.away-score').removeClass('gr');
            if (game.HomeTeamScore < game.AwayTeamScore) {
                $('.list-item[id="' + game.ScheduleKey + '"] span.home-score').addClass('gr');
            } else if (game.HomeTeamScore > game.AwayTeamScore) {
                $('.list-item[id="' + game.ScheduleKey + '"] span.away-score').addClass('gr');
            }
        }

        if (game.GameEndedFlg == true) {
            if (game.RecordFixedFlg == true) {
                status = 'FINAL';
            } else {
                status = '試合終了';
            }

            // ボタン切替
            if (schedule_contexts[game.ScheduleKey].Event == '7' || schedule_contexts[game.ScheduleKey].Event == '8' || schedule_contexts[game.ScheduleKey].Event == '9') {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '?utm_source=bleague&utm_medium=bleague&utm_campaign=107" target="_blank">見逃し配信</a>');
            } else {
                let tomorrow = GeniusSchedule.ParseBitDateTime(game.GameDateTime);
                if (tomorrow !== undefined) {
                    tomorrow.setDate(tomorrow.getDate() + 1);tomorrow.setHours(0);tomorrow.setMinutes(0);
                    if (Date.now() >= tomorrow.getTime()) {
                        if (game.ScheduleKey == 502494) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14682" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 502495) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14683" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 502496) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14684" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503880) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17064" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503881) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17065" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503882) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17066" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506010) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19560" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506011) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19559" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506052) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19555" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506053) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19556" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506054) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a class="btn disabled" href="javascript:void(0)">ハイライト</a>');
                        } else if (game.ScheduleKey == 506055) {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19558" target="_blank">ハイライト</a>');
                        } else {
                            $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/api/v1/video/highlight?game_id=' + game.ScheduleKey + '&utm_source=bleague&utm_medium=bleague&utm_campaign=273" target="_blank">ハイライト</a>');
                        }
                    } else {
                        $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">見逃し配信</a>');
                    }
                }
            }
        } else {
            if (game.ScheduleKey == 502494) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105982" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 502495) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105988" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 502496) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105989" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503880) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107617" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503881) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107622" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503882) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/503882" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506010) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/506010" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506011) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109551" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506052) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109541" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506053) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109542" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506054) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109543" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506055) {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109544" target="_blank">ライブ配信</a>');
            } else {
                $('.list-item[id="' + game.ScheduleKey + '"] div.data-link > a.btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">ライブ配信</a>');
            }                 
        }

        $('.list-item[id="' + game.ScheduleKey + '"] div.info-scorestate').html('<span>' + status + '</span>');
        $('.list-item[id="' + game.ScheduleKey + '"] a.data-game').attr('href', '/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=2');

        $('.list-item[id="' + scheduleKey + '"] span.winner-link').remove();
    }
}

// スケジュールの更新(TOP)
function renderTopSchedule(scheduleKey, data) {
    // 試合開始前
    if (data === null || schedule_contexts[scheduleKey].Game.GameDateTime * 1000 > Date.now()) {
        $('.inner-item-top[id="' + scheduleKey + '"] div.info-scorestate').html('<div class="text-link"><span class="link-line">見どころ</span></div>');
        $('.inner-item-top[id="' + scheduleKey + '_sp"] div.info-scorestate').html('<div class="text-link"><span class="link-line">見どころ</span></div>');
        $('.inner-item-top[id="' + scheduleKey + '"]').closest('a.item-top').attr('href', '/game_detail/?ScheduleKey=' + scheduleKey + '&tab=1');
        $('.inner-item-top[id="' + scheduleKey + '_sp"]').closest('a.item-top').attr('href', '/game_detail/?ScheduleKey=' + scheduleKey + '&tab=1');

        if (schedule_contexts[scheduleKey].Game.GameDateTime * 1000 < Date.now() + 60 * 10 * 1000) {
            $('div.item-bottom[id="b' + scheduleKey + '"] span.winner-link').remove();
            $('div.item-bottom[id="b' + scheduleKey + '_sp"] span.winner-link').remove();
        }   
        return;
    }

    const game = data.Game;
    
    if (game.GameCurrentPeriod > 0) {
        let status = '試合前';
        let status2 = '試合前';

        if (!!game.PlayByPlayExistsFlg && game.PlayByPlayExistsFlg == true) {
            const periods = GeniusSchedule.getCurrentPeriodsByPlayByPlays(data.PlayByPlays, game.MaxPeriod);
            const playByPlays = data.PlayByPlays;
            let pbpLast;

            // クォーター名
            $.each(periods, function (index, value) {
                status = value[0];
                status2 = '<span class="scoreboard-match__title__quarter">' + value[0] + '</span>';
            });

            (playByPlays || []).forEach(function (pbp) {
                if (pbpLast) {
                    if (pbp.Period >= pbpLast.Period) {
                        pbpLast = pbp;
                    }
                } else {
                    pbpLast = pbp;
                }
            });

            if (pbpLast.ActionCD1 == 81) {
                // 試合終了
                status = '試合終了'; status2 = '試合終了';
            } else if (pbpLast.ActionCD1 == 83) {
                // ピリオドエンド
                if (pbpLast.Period == 2) {
                    status = 'ハーフタイム'; status2 = 'ハーフタイム';
                } else {
                    status = status + " 残り " + pbpLast.RestTime;
                    status2 = status2 + " 残り" + '<span class="scoreboard-match__title__time">' + pbpLast.RestTime + '</span>';
                }
            } else {
                status = status + " 残り " + pbpLast.RestTime;
                status2 = status2 + " 残り" + '<span class="scoreboard-match__title__time">' + pbpLast.RestTime + '</span>';
            }
         } else {
            const periodNames = ['1Q', '2Q', '3Q', '4Q', 'OT1', 'OT2', 'OT3', 'OT4'];
            const periodName = periodNames[game.GameCurrentPeriod - 1] || game.GameCurrentPeriod + 'Q';
            status = periodName;
            status2 = '<span class="scoreboard-match__title__quarter">' + periodName + '</span>';
        }

        // スコア
        if (game.HomeTeamScore !== null && game.AwayTeamScore !== null) {
            $('.inner-item-top[id="' + game.ScheduleKey + '"] div.home-score').html('<span>' + game.HomeTeamScore + '</span>');
            $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.home-score').html('<span>' + game.HomeTeamScore + '</span>');
            $('.inner-item-top[id="' + game.ScheduleKey + '"] div.away-score').html('<span>' + game.AwayTeamScore + '</span>');
            $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.away-score').html('<span>' + game.AwayTeamScore + '</span>');
            $('.inner-item-top[id="' + game.ScheduleKey + '"] div.away-score').removeClass('is-win');
            $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.away-score').removeClass('is-win');
            $('.inner-item-top[id="' + game.ScheduleKey + '"] div.home-score').removeClass('is-win');
            $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.home-score').removeClass('is-win');
            if (game.HomeTeamScore > game.AwayTeamScore) {
                $('.inner-item-top[id="' + game.ScheduleKey + '"] div.home-score').addClass('is-win');
                $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.home-score').addClass('is-win');
            } else if (game.HomeTeamScore < game.AwayTeamScore) {
                $('.inner-item-top[id="' + game.ScheduleKey + '"] div.away-score').addClass('is-win');
                $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.away-score').addClass('is-win');
            }
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__top-score').html(game.HomeTeamScore);
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__top-score').removeClass('scoreboard-match__top-score--lose');
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__bottom-score').html(game.AwayTeamScore);
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__bottom-score').removeClass('scoreboard-match__bottom-score--lose');
            if (game.HomeTeamScore > game.AwayTeamScore) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__bottom-score').addClass('scoreboard-match__bottom-score--lose');
            } else if (game.HomeTeamScore < game.AwayTeamScore) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__top-score').addClass('scoreboard-match__top-score--lose');
            }
        }

        if (game.GameEndedFlg == true) {
            if (game.RecordFixedFlg == true) {
                status = 'FINAL'; status2 = 'FINAL'; 
            } else {
                status = '試合終了'; status2 = '試合終了';
            }

            // ボタン切替
            if (schedule_contexts[game.ScheduleKey].Event == '7' || schedule_contexts[game.ScheduleKey].Event == '8' || schedule_contexts[game.ScheduleKey].Event == '9') {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '?utm_source=bleague&utm_medium=bleague&utm_campaign=107" target="_blank">見逃し配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '?utm_source=bleague&utm_medium=bleague&utm_campaign=107" target="_blank">見逃し配信</a>');
            } else {
                let tomorrow = GeniusSchedule.ParseBitDateTime(game.GameDateTime);
                if (tomorrow !== undefined) {
                    tomorrow.setDate(tomorrow.getDate() + 1);tomorrow.setHours(0);tomorrow.setMinutes(0);
                    if (Date.now() >= tomorrow.getTime()) {
                        if (game.ScheduleKey == 502494) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14682" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14682" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 502495) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14683" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14683" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 502496) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14684" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/14684" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503880) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17064" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17064" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503881) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17065" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17065" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 503882) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17066" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/17066" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506010) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19560" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19560" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506011) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19559" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19559" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506052) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19555" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19555" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506053) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19556" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19556" target="_blank">ハイライト</a>');
                        } else if (game.ScheduleKey == 506054) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a class="btn disabled" href="javascript:void(0)">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a class="btn disabled" href="javascript:void(0)">ハイライト</a>');
                        } else if (game.ScheduleKey == 506055) {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19558" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/videos/19558" target="_blank">ハイライト</a>');
                        } else {
                            $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/api/v1/video/highlight?game_id=' + game.ScheduleKey + '&utm_source=bleague&utm_medium=bleague&utm_campaign=273" target="_blank">ハイライト</a>');
                            $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_video" href="https://basketball.mb.softbank.jp/api/v1/video/highlight?game_id=' + game.ScheduleKey + '&utm_source=bleague&utm_medium=bleague&utm_campaign=273" target="_blank">ハイライト</a>');
                        }
                    } else {
                        $('div.item-bottom[id="b' + game.ScheduleKey + '"]  > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">見逃し配信</a>');
                        $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"]  > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_minogashi" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">見逃し配信</a>');
                    }
                }
            }

            $('#scoreboard_' + game.ScheduleKey + ' div.scoreboard__match').first().attr('class', 'scoreboard__match');
            $('#scoreboard_' + game.ScheduleKey + ' a.scoreboard__match').not('.scoreboard__match--back').attr('class', 'scoreboard__match scoreboard__match--link');
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__title').html(status2);
            $('#scoreboard_' + game.ScheduleKey).data("match", 3);

            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=2" class="scoreboard__match-back-link">試合レポート</a>');
        } else {
            if (game.ScheduleKey == 502494) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105982" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105982" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 502495) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105988" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105988" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 502496) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105989" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/105989" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503880) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107617" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107617" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503881) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107622" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/107622" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 503882) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/503882" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/503882" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506010) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/506010" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/506010" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506011) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109551" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109551" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506052) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109541" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109541" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506053) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109542" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109542" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506054) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109543" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109543" target="_blank">ライブ配信</a>');
            } else if (game.ScheduleKey == 506055) {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109544" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/109544" target="_blank">ライブ配信</a>');
            } else {
                $('div.item-bottom[id="b' + game.ScheduleKey + '"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">ライブ配信</a>');
                $('div.item-bottom[id="b' + game.ScheduleKey + '_sp"] > .btn').replaceWith('<a rel="noopener" class="btn secondary icon-blank click_schedule_live" href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank">ライブ配信</a>');
            }

            $('#scoreboard_' + game.ScheduleKey + ' div.scoreboard__match').first().attr('class', 'scoreboard__match scoreboard__match--live');
            $('#scoreboard_' + game.ScheduleKey + ' a.scoreboard__match').not('.scoreboard__match--back').attr('class', 'scoreboard__match scoreboard__match--link scoreboard__match--live');

            if (location.search == location.search) {
                let urlParam = location.search.substring(1);
                let param = urlParam.split("=");

                if (param[1] == game.ScheduleKey + '&tab') {
                    $('#scoreboard_' + game.ScheduleKey + ' div.scoreboard__match').first().addClass('is-active');
                    $('#scoreboard_' + game.ScheduleKey + ' a.scoreboard__match').not('.scoreboard__match--back').addClass('is-active');
                }
            }

            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__title').empty();
            $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__title').html(status2);
            if ($.inArray(game.ScheduleKey, window.basketlivefree) >= 0) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard-match__title').prepend('<span class="scoreboard-match__title__free">無料配信</span>');
            }

            $('#scoreboard_' + game.ScheduleKey).data("match", 1);

            if (game.ScheduleKey == 502494) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/105982" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 502495) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/105988" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 502496) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/105989" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 503880) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/107617" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 503881) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/107622" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 503882) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/503882" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506010) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/506010" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506011) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/109551" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506052) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=1" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/109541" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506053) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=1" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/109542" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506054) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=1" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/109543" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else if (game.ScheduleKey == 506055) {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=1" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/109544" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            } else {
                $('#scoreboard_' + game.ScheduleKey + ' .scoreboard__match--back').html('<a href="/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=4" class="scoreboard__match-back-link">ボックススコア</a><hr /><a href="https://basketball.mb.softbank.jp/lives/' + game.ScheduleKey + '/?utm_source=bleague&utm_medium=bleague&utm_campaign=bleague_bleague_033" target="_blank" class="scoreboard__match-back-link scoreboard__match-back-link--live">ライブ配信</a>');
            }
        }

        $('.inner-item-top[id="' + game.ScheduleKey + '"] div.info-scorestate').html('<span>' + status + '</span>');
        $('.inner-item-top[id="' + game.ScheduleKey + '_sp"] div.info-scorestate').html('<span>' + status + '</span>');
        $('.inner-item-top[id="' + game.ScheduleKey + '"]').closest('a.item-top').attr('href', '/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=2');
        $('.inner-item-top[id="' + game.ScheduleKey + '_sp"]').closest('a.item-top').attr('href', '/game_detail/?ScheduleKey=' + game.ScheduleKey + '&tab=2');

        $('div.item-bottom[id="b' + scheduleKey + '"] span.winner-link').remove();
        $('div.item-bottom[id="b' + scheduleKey + '_sp"] span.winner-link').remove();

        $('.scoreboard .swiper-slide').sort((a, b) => { return $(a).data("match") - $(b).data("match"); }).appendTo('.scoreboard > .swiper-wrapper');
    }
}


class GeniusSchedule {
    //ピリオド
    static getCurrentPeriods(game) {
        var periods = null;
        if (game.MaxPeriod == 4) {
            //normal
            periods = [['1Q', 'TeamScore01'], ['2Q', 'TeamScore02'], ['3Q', 'TeamScore03'], ['4Q', 'TeamScore04'], ['OT1', 'TeamScore05'], ['OT2', 'TeamScore06'], ['OT3', 'TeamScore07'], ['OT4', 'TeamScore08'], ['OT5', 'TeamScore09'], ['OT6', 'TeamScore10'], ['OT7', 'TeamScore11'], ['OT8', 'TeamScore12'], ['OT9', 'TeamScore13'], ['OT10', 'TeamScore14']];
        } else if (game.MaxPeriod == 2) {
            //CS QF,SF 3rd Round
            //periods = [['1st', 'TeamScore01'], ['2nd', 'TeamScore02'], ['EX1', 'TeamScore03'], ['EX2', 'TeamScore04'], ['EX3', 'TeamScore05'], ['EX4', 'TeamScore06'], ['EX5', 'TeamScore07'], ['EX6', 'TeamScore08'], ['EX7', 'TeamScore09'], ['EX8', 'TeamScore10'], ['EX9', 'TeamScore11'], ['EX10','TeamScore12'], ['EX11', 'TeamScore13'], ['EX12','TeamScore14']];
        } else {
            throw new TypeError("malformed MaxPeriod");
        }
        return periods.splice(0, (game.GameCurrentPeriod || 0));
    }

    static getCurrentPeriodsByPlayByPlays(playByPlays, maxPeriod) {
        var pbpLast;
        (playByPlays || []).forEach(function (pbp) {
            if (pbpLast) {
                if (pbp.Period >= pbpLast.Period) {
                    pbpLast = pbp;
                }
            } else {
                pbpLast = pbp;
            }
        });
        
        var periods = null;
        if (maxPeriod == 4) {
            //normal
            periods = [['1Q', 'TeamScore01'], ['2Q', 'TeamScore02'], ['3Q', 'TeamScore03'], ['4Q', 'TeamScore04'], ['OT1', 'TeamScore05'], ['OT2', 'TeamScore06'], ['OT3', 'TeamScore07'], ['OT4', 'TeamScore08'], ['OT5', 'TeamScore09'], ['OT6', 'TeamScore10'], ['OT7', 'TeamScore11'], ['OT8', 'TeamScore12'], ['OT9', 'TeamScore13'], ['OT10', 'TeamScore14']];
        } else if (maxPeriod == 2) {
            //CS QF,SF 3rd Round
            //periods = [['1st', 'TeamScore01'], ['2nd', 'TeamScore02'], ['EX1', 'TeamScore03'], ['EX2', 'TeamScore04'], ['EX3', 'TeamScore05'], ['EX4', 'TeamScore06'], ['EX5', 'TeamScore07'], ['EX6', 'TeamScore08'], ['EX7', 'TeamScore09'], ['EX8', 'TeamScore10'], ['EX9', 'TeamScore11'], ['EX10','TeamScore12'], ['EX11', 'TeamScore13'], ['EX12','TeamScore14']];
        } else {
            throw new TypeError("malformed MaxPeriod");
        }
        return periods.splice(0, (pbpLast.Period || 0));
    }

    //試合開始前判定
    static isAfterTipOff(game) {
        if (typeof game.GameCurrentPeriod == "undefined"
            || game.GameCurrentPeriod == ""
            || game.GameCurrentPeriod == 0) {
            return false;
        } else if (game.GameCurrentPeriod > 0) {
            return true;
        }
        throw new TypeError("malformed gamesummary");
    }

    //試合開始時間判定
    static isAfterGameDateTime(game) {
        const gameDateTime = GeniusSchedule.ParseBitDateTime(game.GameDateTime);
        if (gameDateTime !== undefined) {
            if (Date.now() > gameDateTime.getTime()) {
                return true;
            } else {
                return false;
            }
        }
        throw new TypeError("malformed gamesummary");
    }

    //ParseBitDateTime
    static ParseBitDateTime(str) {
        var linuxTime = (str || "").match(new RegExp('^/Date\\((\\d+)?\\+\\d+\\)/$'));
        if (!!linuxTime && linuxTime.length == 2) {
            return new Date(parseInt(linuxTime[1], 10));
        } 

        var linuxTime = (str || "").match(new RegExp('^(\\d+)$'));
        if (!!linuxTime && linuxTime.length == 2) {
            return new Date(parseInt(linuxTime[1], 10));
        } 
        
        return undefined;
    }
}