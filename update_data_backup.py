
import urllib.request
import json
import re
import time
from html import unescape
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta

BASE = "https://www.bleague.jp"
HEADERS = {"User-Agent": "Mozilla/5.0"}
JST = timezone(timedelta(hours=9))


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

            print(
                f"  {game_date}: {len(games)}試合"
            )

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


def main():
    print("B.PREMIER公式データを取得します...")

    schedule = get_schedule()
    standings = get_standings()

    result = {
        "updated": datetime.now(JST).isoformat(),
        "season": "2026-27",
        "league": "B.PREMIER",
        "schedule": schedule,
        "standings": standings,
        "source": BASE
    }

    with open("data.json", "w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)

    print("\n取得完了！")
    print("試合データ:", len(schedule), "件")
    print("東地区:", len(standings.get("東地区", [])), "チーム")
    print("西地区:", len(standings.get("西地区", [])), "チーム")
    print("data.jsonを更新しました。")


if __name__ == "__main__":
    main()
