"""Shared pagination: one query-param contract, one response envelope shape.

Before this, projects/tasks/users each reinvented pagination differently
(page+results_per_page vs unbounded skip+limit vs none at all), with
mismatched/incompatible response shapes. Use PaginationParams for the
query params and PaginationMeta for the response envelope everywhere a
list endpoint needs paging.
"""

import math
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel


class PaginationParams(BaseModel):
    page: int
    per_page: int

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.per_page


def pagination_params(
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    per_page: Annotated[
        int, Query(gt=0, le=100, description="Results per page")
    ] = 20,
) -> PaginationParams:
    return PaginationParams(page=page, per_page=per_page)


class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool
    next_num: int | None
    prev_num: int | None


def paginate(params: PaginationParams, total: int) -> PaginationMeta:
    total_pages = math.ceil(total / params.per_page) if total else 0
    has_next = params.page < total_pages
    has_prev = params.page > 1
    return PaginationMeta(
        page=params.page,
        per_page=params.per_page,
        total=total,
        total_pages=total_pages,
        has_next=has_next,
        has_prev=has_prev,
        next_num=params.page + 1 if has_next else None,
        prev_num=params.page - 1 if has_prev else None,
    )
