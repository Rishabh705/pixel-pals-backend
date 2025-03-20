-- Create database if it doesn't exist (only works in some DB engines, not PostgreSQL)
-- CREATE DATABASE IF NOT EXISTS pixelpals; -- REMOVE this line, PostgreSQL doesn't support it this way

-- Instead, check if the database exists before creating it
-- Check if the database exists, and create it if not
CREATE DATABASE pixelpals;

-- Create a user with the specified username and password
CREATE USER razor WITH ENCRYPTED PASSWORD 'razor@123';

-- Configure role settings
ALTER ROLE razor SET client_encoding TO 'utf8';
ALTER ROLE razor SET default_transaction_isolation TO 'read committed';
ALTER ROLE razor SET timezone TO 'UTC';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pixelpals TO razor;

-- Connect to the database
\c pixelpals

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS Users (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255) DEFAULT 'https://github.com/shadcn.png',
    refreshToken TEXT,
    publicKey TEXT NOT NULL, -- Base64-encoded public key
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Messages (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message TEXT NOT NULL, -- Storing the encrypted message
    sender UUID REFERENCES Users(_id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    chat_type VARCHAR(50) CHECK (chat_type IN ('individual', 'group')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Keys (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL, -- Refers to either individual or group chat
    chat_type VARCHAR(50) CHECK (chat_type IN ('individual', 'group')), -- Chat type (individual/group)
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE, -- The user for whom the AES key is encrypted
    encrypted_aes_key TEXT NOT NULL, -- The AES key encrypted with the user's public key
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (chat_id, chat_type, user_id) -- Ensure unique encrypted key for each user in a chat
);


CREATE TABLE IF NOT EXISTS IndividualChats (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant1 UUID REFERENCES Users(_id) ON DELETE CASCADE,
    participant2 UUID REFERENCES Users(_id) ON DELETE CASCADE,
    lastMessage UUID REFERENCES Messages(_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS GroupChats (
    _id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    avatar VARCHAR(255) DEFAULT 'https://github.com/shadcn.png',
    lastMessage UUID REFERENCES Messages(_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);



CREATE TABLE IF NOT EXISTS UserChats (
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    chat_type VARCHAR(50) CHECK (chat_type IN ('individual', 'group')),
    PRIMARY KEY (user_id, chat_id, chat_type)
);

CREATE TABLE IF NOT EXISTS UserSavedContacts (
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS IndividualChatMessages (
    individualchat_id UUID REFERENCES IndividualChats(_id) ON DELETE CASCADE,
    message_id UUID REFERENCES Messages(_id) ON DELETE CASCADE,
    PRIMARY KEY (individualchat_id, message_id)
);

CREATE TABLE IF NOT EXISTS GroupChatParticipants (
    groupchat_id UUID REFERENCES GroupChats(_id) ON DELETE CASCADE,
    user_id UUID REFERENCES Users(_id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('member', 'admin')) DEFAULT 'member',
    PRIMARY KEY (groupchat_id, user_id)
);


CREATE TABLE IF NOT EXISTS GroupChatMessages (
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