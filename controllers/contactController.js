const User = require('../model/User')

const addContact = async (req, res) => {
    if (!req.body.contactname) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const userId = req.user._id;
        const contactname = req.body.contactname;

        const foundUser = await User.findById(userId)
            .populate({
                path: 'savedContacts',
                select: '_id username avatar'
            })
            .exec();

        if (!foundUser) {
            return res.status(401).json({ message: 'No such user exists' });
        }

        const foundContact = await User.findOne({ username: contactname }).exec();
        if (!foundContact) {
            return res.status(401).json({ message: 'No such contact exists' });
        }

        // Check if contact already exists in user's contact list
        const contactExists = foundUser.savedContacts.some(
            contact => contact._id.toString() === foundContact._id.toString()
        );

        if (!contactExists) {
            foundUser.savedContacts.push(foundContact._id); // Only push the ID
            await foundUser.save();
        }

        res.status(201).json({
            message: 'Contact added to contact list successfully.',
            data: foundUser.savedContacts,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error adding contact' });
    }
};


const getContacts = async (req, res) => {
    if (!req.query.userId) {
        return res.status(400).json({ message: 'User Id is required' });
    }
    
    try {
        
        const {userId} = req.query;

        const foundUser = await User.findById(userId)
        .populate({
            'path': 'savedContacts',
            select:'_id username avatar'
        })
        .exec();
        
        if (!foundUser) {
            return res.status(401).json({ message: 'No such user exists' });
        }

        res.status(200).json({
            message: 'Contacts fetched successfully.',
            data: foundUser.savedContacts,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching contacts' });
    }
};

module.exports = {
    addContact,
    getContacts,
};