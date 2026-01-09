from datetime import date
from ethiopian_date.ethiopian_date import EthiopianDateConverter

ETH_MONTHS = {
    1: "Meskerem",
    2: "Tikimt",
    3: "Hidar",
    4: "Tahsas",
    5: "Tir",
    6: "Yekatit",
    7: "Megabit",
    8: "Miyazya",
    9: "Ginbot",
    10: "Sene",
    11: "Hamle",
    12: "Nehase",
    13: "Pagume",
}

def gregorian_to_ethiopian(g_date: date) -> dict:
    y, m, d = EthiopianDateConverter.to_ethiopian(g_date.year, g_date.month, g_date.day)
    return {"year": y, "month": m, "day": d, "month_name": ETH_MONTHS.get(m)}

def ethiopian_to_gregorian(year: int, month: int, day: int) -> dict:
    y, m, d = EthiopianDateConverter.to_gregorian(year, month, day)
    return {"year": y, "month": m, "day": d}
