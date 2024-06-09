CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE Users (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255) DEFAULT 'https://github.com/shadcn.png',
    refreshToken VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE Messages (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message VARCHAR(255) NOT NULL,
    sender UUID REFERENCES Users(_id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    chat_type VARCHAR(50) CHECK (chat_type IN ('individual', 'group')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IndividualChats (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant1 UUID REFERENCES Users(_id) ON DELETE CASCADE,
    participant2 UUID REFERENCES Users(_id) ON DELETE CASCADE,
    lastMessage UUID REFERENCES Messages(_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE GroupChats (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    avatar VARCHAR(255) DEFAULT 'https://github.com/shadcn.png',
    owner UUID REFERENCES Users(_id) ON DELETE CASCADE,
    lastMessage UUID REFERENCES Messages(_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE UserChats (
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    chat_type VARCHAR(50) CHECK (chat_type IN ('individual', 'group')),
    PRIMARY KEY (user_id, chat_id, chat_type)
);

CREATE TABLE UserSavedContacts (
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, contact_id)
);

CREATE TABLE IndividualChatMessages (
    individualchat_id UUID REFERENCES IndividualChats(_id) ON DELETE CASCADE,
    message_id UUID REFERENCES Messages(_id) ON DELETE CASCADE,
    PRIMARY KEY (individualchat_id, message_id)
);

CREATE TABLE GroupChatParticipants (
    groupchat_id UUID REFERENCES GroupChats(_id) ON DELETE CASCADE,
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    PRIMARY KEY (groupchat_id, user_id)
);

CREATE TABLE GroupChatAdmins (
    groupchat_id UUID REFERENCES GroupChats(_id) ON DELETE CASCADE,
    admin_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    PRIMARY KEY (groupchat_id, admin_id)
);

CREATE TABLE GroupChatMessages (
    groupchat_id UUID REFERENCES GroupChats(_id) ON DELETE CASCADE,
    message_id UUID REFERENCES Messages(_id) ON DELETE CASCADE,
    PRIMARY KEY (groupchat_id, message_id)
);

CREATE OR REPLACE FUNCTION enforce_chat_fk()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.chat_type = 'individual' THEN
        IF NOT EXISTS (SELECT 1 FROM IndividualChats WHERE _id = NEW.chat_id) THEN
            RAISE EXCEPTION 'Invalid chat_id for individual chat';
        END IF;
    ELSIF NEW.chat_type = 'group' THEN
        IF NOT EXISTS (SELECT 1 FROM GroupChats WHERE _id = NEW.chat_id) THEN
            RAISE EXCEPTION 'Invalid chat_id for group chat';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid chat_type';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_chat_fk_trigger
BEFORE INSERT OR UPDATE ON Messages
FOR EACH ROW EXECUTE FUNCTION enforce_chat_fk();

-- Drop Individual Tables and its dependents
DROP TABLE IF EXISTS IndividualChatMessages CASCADE;
DROP TABLE IF EXISTS IndividualChats CASCADE;
DROP TABLE IF EXISTS Messages CASCADE;
DROP TABLE IF EXISTS UserSavedContacts CASCADE;
DROP TABLE IF EXISTS UserChats CASCADE;
DROP TABLE IF EXISTS Users CASCADE;

-- Drop Group Tables and its dependents
DROP TABLE IF EXISTS GroupChatMessages CASCADE;
DROP TABLE IF EXISTS GroupChatAdmins CASCADE;
DROP TABLE IF EXISTS GroupChatParticipants CASCADE;
DROP TABLE IF EXISTS GroupChats CASCADE;

-- Drop Enum Type
DROP TYPE IF EXISTS CHATTYPE CASCADE;
