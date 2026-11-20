
import urllib.request
import json
import re
import time
import os
from html import unescape
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta

BASE = "https://www.bleague.jp"
HEADERS = {"User-Agent": "Mozilla/5.0"}
JST = timezone(timedelta(hours=9))
DATA_FILE = "data.json"


def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        value = data.strip()
        if value:
            self.parts.append(value)


def text_content(html):
    parser = Parser()
    parser.feed(html)
    return parser.parts


def clean(value):
    return unescape(re.sub(r"<[^>]+>", "", value)).strip()


def get_month_dates(year, month):
    url = (
        f"{BASE}/schedule/?year={year}&mon={month:02d}"
        "&day=01&event=2&club=&tab=1&ha=&fb="
    )

    html = fetch(url)

    days = sorted(set(
        re.findall(r'data-day="(\d+)"', html)
    ))

    return [
        f"{year}-{month:02d}-{int(day):02d}"
        for day in days
    ]


def parse_game(card, game_date, game_id):
    teams = re.findall(
        r'<span class="team-name">(.*?)</span>',
        card,
        re.S
    )

    if len(teams) < 2:
        return None

    home_score = re.search(
        r'class="number home-score[^"]*"[^>]*>\s*<span>(.*?)</span>',
        card,
        re.S
    )

    away_score = re.search(
        r'class="number away-score[^"]*"[^>]*>\s*<span>(.*?)</span>',
        card,
        re.S
    )

    arena = re.search(
        r'<div class="info-arena">(.*?)</div>',
        card,
        re.S
    )

    arena_parts = (
        text_content(arena.group(1))
        if arena else []
    )

    status_match = re.search(
        r'<div class="info-scorestate">(.*?)</div>',
        card,
        re.S
    )

    status = (
        " ".join(text_content(status_match.group(1)))
        if status_match else "試合予定"
    )

    link = re.search(
        r'<a class="data-game[^"]*"[^>]*href="([^"]+)"',
        card,
        re.S
    )

    detail = (
        unescape(link.group(1))
        if link else f"/game_detail/?ScheduleKey={game_id}"
    )

    if detail.startswith("/"):
        detail = BASE + detail

    return {
        "id": game_id,
        "date": game_date,
        "home": clean(teams[0]),
        "away": clean(teams[1]),
        "homeScore": clean(home_score.group(1)) if home_score else "",
        "awayScore": clean(away_score.group(1)) if away_score else "",
        "venue": arena_parts[0] if arena_parts else "",
        "time": arena_parts[-1] if len(arena_parts) >= 2 else "",
        "status": status,
        "info": text_content(card),
        "detail": detail
    }


def get_day_games(game_date):
    year, month, day = game_date.split("-")

    url = (
        f"{BASE}/schedule/?data_format=json"
        f"&year={year}&mon={int(month)}&day={int(day)}"
        "&event=2&club=&tab=1&ha=&fb=&index=20"
    )

    try:
        data = json.loads(fetch(url))
    except Exception as error:
        print("取得エラー:", game_date, error)
        return []

    games = []

    for card in data.get("topics", []):
        id_match = re.search(
            r'<li class="list-item" id="([^"]+)"',
            card
        )

        if not id_match:
            continue

        game = parse_game(
            card,
            game_date,
            id_match.group(1)
        )

        if game:
            games.append(game)

    return games


def get_schedule():
    all_games = {}

    months = [
        (2026, month) for month in range(9, 13)
    ] + [
        (2027, month) for month in range(1, 6)
    ]

    for year, month in months:
        print(f"{year}年{month}月の開催日を確認中...")

        try:
            dates = get_month_dates(year, month)
        except Exception as error:
            print("月の取得エラー:", error)
            continue

        for game_date in dates:
            games = get_day_games(game_date)

            for game in games:
                all_games[game["id"]] = game

            print(f"  {game_date}: {len(games)}試合")
            time.sleep(0.2)

    result = list(all_games.values())
    result.sort(key=lambda g: (g["date"], g["time"]))

    return result


def get_standings():
    html = fetch(BASE + "/standings/?tab=1&year=2026")

    tables = re.findall(
        r'<h3[^>]*>(東地区|西地区)</h3>.*?'
        r'<table[^>]*table-standings[^>]*>(.*?)</table>',
        html,
        re.S
    )

    result = {}

    for area, table_html in tables:
        teams = []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.S)

        for row in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)

            if len(cells) < 15:
                continue

            team_name = re.search(
                r'<span class="sp-dn team-name-line">(.*?)</span>',
                cells[1],
                re.S
            )

            if not team_name:
                team_name = re.search(
                    r'<span class="pc-tab-dn">(.*?)</span>',
                    cells[1],
                    re.S
                )

            teams.append({
                "rank": clean(cells[0]),
                "team": clean(team_name.group(1)) if team_name else clean(cells[1]),
                "wins": clean(cells[2]),
                "losses": clean(cells[3]),
                "winRate": clean(cells[4]),
                "gamesBehind": clean(cells[5]),
                "points": clean(cells[6]),
                "pointsAgainst": clean(cells[7]),
                "pointDifference": clean(cells[8]),
                "home": clean(cells[9]),
                "away": clean(cells[10]),
                "last5": clean(cells[11]),
                "streak": clean(cells[12]),
                "gamesPlayed": clean(cells[13]),
                "completionRate": clean(cells[14])
            })

        result[area] = teams

    return result


def is_finished(game):
    return (
        game.get("status") == "FINAL"
        and str(game.get("homeScore", "")).isdigit()
        and str(game.get("awayScore", "")).isdigit()
    )


def merge_schedule(old_schedule, new_schedule):
    """
    既存試合を保持しつつ、新しい取得結果で更新する。
    取得失敗などでFINAL結果が消えないようにする。
    """
    merged = {}

    for game in old_schedule:
        if game.get("id"):
            merged[str(game["id"])] = game.copy()

    for game in new_schedule:
        game_id = str(game.get("id", ""))

        if not game_id:
            continue

        old_game = merged.get(game_id)

        if old_game:
            updated_game = old_game.copy()
            updated_game.update(game)

            # 既存の確定結果を、不完全な取得結果で上書きしない
            if is_finished(old_game) and not is_finished(game):
                for key in [
                    "homeScore",
                    "awayScore",
                    "status",
                    "info"
                ]:
                    updated_game[key] = old_game.get(key, "")

            merged[game_id] = updated_game
        else:
            merged[game_id] = game

    result = list(merged.values())
    result.sort(
        key=lambda g: (
            g.get("date", ""),
            g.get("time", "")
        )
    )

    return result


def load_old_data():
    if not os.path.exists(DATA_FILE):
        return {}

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as error:
        print("既存data.jsonの読み込みエラー:", error)
        return {}


def update_standings_history(old_history, standings):
    """
    1日1件の公式順位スナップショットを保存する。
    同じ日に再実行した場合は、その日の記録を更新する。
    """
    history = old_history if isinstance(old_history, list) else []

    today = datetime.now(JST).strftime("%Y-%m-%d")

    history = [
        item for item in history
        if item.get("date") != today
    ]

    if standings.get("東地区") and standings.get("西地区"):
        history.append({
            "date": today,
            "standings": standings
        })

    history.sort(key=lambda item: item.get("date", ""))

    return history


def main():
    print("B.PREMIER公式データを取得します...")

    old_data = load_old_data()

    new_schedule = get_schedule()
    new_standings = get_standings()

    # 既存データと新規データを統合
    schedule = merge_schedule(
        old_data.get("schedule", []),
        new_schedule
    )

    # 順位取得に失敗した場合は既存順位を維持
    if (
        new_standings.get("東地区")
        and new_standings.get("西地区")
    ):
        standings = new_standings
    else:
        print("順位取得が不完全なため、既存順位を保持します。")
        standings = old_data.get("standings", {})

    # 過去の順位履歴を引き継いで今回の順位を追加
    standings_history = update_standings_history(
        old_data.get("standingsHistory", []),
        standings
    )

    result = {
        "updated": datetime.now(JST).isoformat(),
        "season": "2026-27",
        "league": "B.PREMIER",
        "schedule": schedule,
        "standings": standings,
        "standingsHistory": standings_history,
        "source": BASE
    }

    # JSONを書き出す
    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)

    finished_count = sum(
        1 for game in schedule if is_finished(game)
    )

    print("\n取得完了！")
    print("試合データ:", len(schedule), "件")
    print("終了済み試合:", finished_count, "件")
    print("東地区:", len(standings.get("東地区", [])), "チーム")
    print("西地区:", len(standings.get("西地区", [])), "チーム")
    print("順位履歴:", len(standings_history), "日分")
    print("data.jsonを更新しました。")


if __name__ == "__main__":
    main()
