"""Response schemas shared across multiple route domains.

Same rationale as pagination.py: several routes across projects/tasks/
drones/gcp reinvented the same `{"message": ...}` ad hoc dict shape with
no response_model set. Use MessageResponse for any route whose entire
response body is a single human-readable status message.
"""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str
