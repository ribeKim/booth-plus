from sqlalchemy import UniqueConstraint

from booth_plus.models import admin_discord_ids, auth_sessions, comments, oauth_accounts


def test_comments_allow_multiple_entries_per_user_and_product() -> None:
    unique_columns = {
        tuple(constraint.columns.keys())
        for constraint in comments.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert ("user_id", "product_id") not in unique_columns
    assert comments.c.user_id.nullable
    assert comments.c.anonymous_id.nullable
    assert comments.c.anonymous_password_hash.nullable
    assert not comments.c.disabled.nullable
    assert not oauth_accounts.c.user_id.nullable
    assert not auth_sessions.c.user_id.nullable
    assert admin_discord_ids.c.provider_user_id.primary_key
